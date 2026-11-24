const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 320, height: 800 });
    page.on('dialog', (dialog) => dialog.accept());
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    async function checkGraphDefault() {
      const view = await page.evaluate(() => ({
        graphHidden: document.querySelector('#graph-container').classList.contains('hidden'),
        tableHidden: document.querySelector('#table-container').classList.contains('hidden'),
        graphButtonsVisible: Array.from(document.querySelectorAll('.graph-only-btn')).every((button) => !button.classList.contains('hidden')),
        toggleLabel: document.querySelector('#toggle-view').getAttribute('aria-label'),
        width: document.querySelector('#scoreChart').getBoundingClientRect().width,
        height: document.querySelector('#scoreChart').getBoundingClientRect().height
      }));
      assert.strictEqual(view.graphHidden, false);
      assert.strictEqual(view.tableHidden, true);
      assert.strictEqual(view.graphButtonsVisible, true);
      assert.strictEqual(view.toggleLabel, 'Show score table');
      assert(view.width > 0 && view.height > 0);
    }

    await page.goto(base + '/round-scores.html');
    await checkGraphDefault();
    await page.click('#toggle-view');
    assert.strictEqual(await page.$eval('#table-container', (el) => el.classList.contains('hidden')), false);
    assert.strictEqual(await page.$eval('#graph-container', (el) => el.classList.contains('hidden')), true);
    assert.strictEqual(await page.$eval('#toggle-view', (el) => el.getAttribute('aria-label')), 'Show score graph');
    assert(await page.$$eval('.graph-only-btn', (buttons) => buttons.every((button) => button.classList.contains('hidden'))));
    await page.click('#toggle-view');
    await checkGraphDefault();
    await page.setViewport({ width: 800, height: 320 });
    await checkGraphDefault();
    await page.click('#toggle-view');
    assert.strictEqual(await page.$eval('#table-container', (el) => el.classList.contains('hidden')), false);
    await page.click('#toggle-view');
    await checkGraphDefault();
    await page.setViewport({ width: 320, height: 800 });

    await page.goto(base + '/sessions.html');
    await page.evaluate(() => {
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((name) => TichuPlayers.addPlayer(name));
    });
    await page.reload();
    for (const label of await page.$$('.player-pick-row label')) await label.click();
    assert.strictEqual(await page.$$eval('.team-preview-card', (cards) => cards.length), 3);
    const previewColors = await page.$$eval('.team-preview-card', (cards) =>
      cards.map((card) => getComputedStyle(card).borderTopColor));
    assert.strictEqual(new Set(previewColors).size, 3);
    await Promise.all([page.waitForNavigation(), page.click('#start-session-btn')]);
    await page.evaluate(() => navigator.serviceWorker.ready);
    const scoreCards = await page.$$eval('.three-team-score', (cards) => cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }));
    assert.strictEqual(scoreCards.length, 3);
    assert(scoreCards.every((card) => card.left >= 0 && card.right <= 320));
    assert.deepStrictEqual(await page.$$eval('.three-team-score', (cards) =>
      cards.map((card) => getComputedStyle(card).borderTopColor)), previewColors);
    assert.deepStrictEqual(await page.$$eval('.remaining-label', (labels) =>
      labels.map((label) => label.textContent)), ['500 left', '500 left', '500 left']);

    async function progressBars() {
      return page.$$eval('.three-team-progress', (bars) => bars.map((bar) => ({
        width: parseFloat(bar.firstElementChild.style.width),
        color: getComputedStyle(bar.firstElementChild).backgroundColor,
        min: Number(bar.getAttribute('aria-valuemin')),
        max: Number(bar.getAttribute('aria-valuemax')),
        value: Number(bar.getAttribute('aria-valuenow')),
        text: bar.getAttribute('aria-valuetext'),
        label: bar.getAttribute('aria-label')
      })));
    }

    let bars = await progressBars();
    assert.strictEqual(bars.length, 3);
    bars.forEach((bar, i) => {
      assert.strictEqual(bar.width, 0);
      assert.strictEqual(bar.color, previewColors[i]);
      assert.strictEqual(bar.min, 0);
      assert.strictEqual(bar.max, 500);
      assert.strictEqual(bar.value, 0);
      assert.strictEqual(bar.text, '0 points out of 500');
      assert(bar.label.endsWith(' progress'));
    });

    async function state() {
      return page.evaluate(() => {
        const game = TichuPlayers.getCurrentGame();
        return {
          game, lineup: TichuPlayers.getRoundLineup(game, game.rounds.length + 1),
          dealer: TichuPlayers.getCurrentRoundDealer(game),
          scores: game.rounds.length ? game.rounds[game.rounds.length - 1].scores : [0, 0, 0]
        };
      });
    }

    let before = await state();
    assert.strictEqual(before.game.mode, 'threeTeams');
    const initialDealer = before.dealer;
    await page.evaluate(() => {
      for (let i = 0; i < 11; i++) document.querySelector('#A .minus').click();
    });
    await page.click('#btn-next');
    let negative = await state();
    bars = await progressBars();
    const negativeIndex = negative.game.rounds[0].activeTeams[0];
    assert.strictEqual(negative.scores[negativeIndex], -5);
    assert.strictEqual(bars[negativeIndex].width, 0);
    assert.strictEqual(bars[negativeIndex].value, 0);
    assert.strictEqual(bars[negativeIndex].text, '-5 points out of 500');
    await page.click('#reset');
    assert((await progressBars()).every((bar) => bar.width === 0));

    let previousDealer = null;
    for (let i = 0; i < 3; i++) {
      const current = await state();
      assert(current.lineup.teamA.concat(current.lineup.teamB).includes(current.dealer));
      const activeColors = await page.$$eval('#A, #B', (cards) =>
        cards.map((card) => getComputedStyle(card).borderTopColor));
      assert.deepStrictEqual(activeColors, current.lineup.activeIndices.map((index) => previewColors[index]));
      if (previousDealer) {
        const previousTeam = current.game.teams.findIndex((team) => team.includes(previousDealer));
        const currentTeam = current.game.teams.findIndex((team) => team.includes(current.dealer));
        assert.notStrictEqual(currentTeam, previousTeam, 'dealer changes pairs');
      }
      previousDealer = current.dealer;
      await page.click('#btn-next');
      assert.deepStrictEqual(errors, []);
      assert.strictEqual((await state()).game.rounds.length, i + 1);
    }
    let after = await state();
    assert.deepStrictEqual(after.scores, [100, 100, 100]);
    assert.deepStrictEqual(await page.$$eval('.remaining-label', (labels) =>
      labels.map((label) => label.textContent)), ['400 left', '400 left', '400 left']);
    assert((await progressBars()).every((bar) => bar.width === 20 && bar.value === 100));
    await page.click('#win-threshold-button');
    await page.click('.win-threshold-option[data-value="750"]');
    assert.deepStrictEqual(await page.$$eval('.remaining-label', (labels) =>
      labels.map((label) => label.textContent)), ['650 left', '650 left', '650 left']);
    assert((await progressBars()).every((bar) => Math.abs(bar.width - 100 / 750 * 100) < 0.0001 && bar.max === 750));
    await page.click('#win-threshold-button');
    await page.$eval('#customWinThreshold', (input) => { input.value = '600'; });
    await page.click('#customWinThresholdApply');
    assert.deepStrictEqual(await page.$$eval('.remaining-label', (labels) =>
      labels.map((label) => label.textContent)), ['500 left', '500 left', '500 left']);
    assert.deepStrictEqual(after.game.rounds.map((r) => r.activeTeams.length), [2, 2, 2]);
    assert.strictEqual(new Set(after.game.rounds.map((r) => [0, 1, 2].find((i) => !r.activeTeams.includes(i)))).size, 3);

    await page.goto(base + '/round-scores.html');
    await checkGraphDefault();
    assert.strictEqual(await page.$$eval('#round-scores tbody tr', (rows) => rows.length), 3);
    assert.strictEqual(await page.evaluate(() => Chart.getChart('scoreChart').data.datasets.length), 3);
    await page.goto(base + '/index.html');
    assert((await progressBars()).every((bar) => Math.abs(bar.width - 100 / 600 * 100) < 0.0001 && bar.max === 600));
    await page.click('#undo');
    const undoneDealer = after.game.rounds[2].dealerPlayerId;
    after = await state();
    assert.strictEqual(after.game.rounds.length, 2);
    assert.strictEqual(after.dealer, undoneDealer);
    bars = await progressBars();
    assert(bars.every((bar, i) => bar.value === after.scores[i]));
    await page.click('#reset');
    assert.deepStrictEqual((await state()).scores, [0, 0, 0]);
    assert.strictEqual((await state()).dealer, initialDealer);
    assert((await progressBars()).every((bar) => bar.width === 0));
    await page.click('#undo');
    assert.strictEqual((await state()).game.rounds.length, 2);
    assert((await progressBars()).every((bar, i) => bar.value === after.scores[i]));
    await page.click('#reset');

    await page.click('#win-threshold-button');
    await page.$eval('#customWinThreshold', (input) => { input.value = '50'; });
    await page.click('#customWinThresholdApply');
    await page.click('#btn-next');
    assert.strictEqual((await state()).game.winner, null, 'tied leaders must continue');
    assert.deepStrictEqual((await page.$$eval('.remaining-label', (labels) =>
      labels.map((label) => label.textContent))).sort(), ['50 left', 'Goal reached', 'Goal reached']);
    await page.click('#btn-next');
    after = await state();
    assert(after.game.winner, 'sole leader wins immediately');
    assert.strictEqual(after.game.pendingNextGame, true);
    const finishedId = after.game.id;
    const winnerIndex = ['A', 'B', 'C'].indexOf(after.game.winner);
    const winnerPlayer = after.game.teams[winnerIndex][0];
    const stats = await page.evaluate((id, sessionId) => TichuPlayers.computePlayerSessionStats(id, sessionId), winnerPlayer, after.game.sessionId);
    assert.strictEqual(stats.gamesWon, 1);
    assert.strictEqual(stats.totalPoints, after.scores[winnerIndex]);
    await page.reload();
    assert.strictEqual((await state()).game.winner, after.game.winner);
    await page.click('#undo');
    assert.strictEqual((await state()).game.winner, null);
    await page.click('#btn-next');
    assert.strictEqual((await state()).game.winner, after.game.winner);
    await page.setOfflineMode(true);
    await page.goto(base + '/round-scores.html?game=' + finishedId);
    await checkGraphDefault();
    assert.strictEqual(await page.$$eval('#round-scores tbody tr', (rows) => rows.length), 2);
    assert.strictEqual(await page.evaluate(() => Chart.getChart('scoreChart').data.datasets.length), 3);
    await page.setOfflineMode(false);
    await page.goto(base + '/index.html');
    await page.click('#win-banner-finish');
    const next = await state();
    assert.notStrictEqual(next.game.id, finishedId);
    const previousPairs = after.game.teams.map((team) => team.slice().sort().join('|'));
    assert(next.game.teams.every((team) => !previousPairs.includes(team.slice().sort().join('|'))));
    const restCounts = {};
    after.game.teams.flat().forEach((id) => { restCounts[id] = 0; });
    after.game.rounds.forEach((round) => {
      const resting = after.game.teams.find((team, index) => !round.activeTeams.includes(index));
      resting.forEach((id) => { restCounts[id]++; });
    });
    const restScores = next.game.teams.map((team) => team.reduce((sum, id) => sum + restCounts[id], 0));
    assert.strictEqual(restScores[next.game.firstRestingTeam], Math.min(...restScores));
    const activeTeam = next.lineup.activeIndices[0];
    await page.evaluate(() => document.querySelector('#tichuDropdownA a[data-value="100"]').click());
    await page.click('label[for="doubleWinA"]');
    await page.click('#btn-next');
    const modified = await state();
    assert.strictEqual(modified.scores[activeTeam], 300);
    bars = await progressBars();
    assert.strictEqual(bars[activeTeam].width, 100);
    assert.strictEqual(bars[activeTeam].value, 50);
    assert.strictEqual(bars[activeTeam].text, '300 points out of 50');
    const modifiedStats = await page.evaluate((id, sessionId) => TichuPlayers.computePlayerSessionStats(id, sessionId),
      next.game.teams[activeTeam][0], next.game.sessionId);
    assert.strictEqual(modifiedStats.tichuWon, 1);
    assert.strictEqual(modifiedStats.doubleWins, 1);
    await page.goto(base + '/session-details.html');
    assert.strictEqual(await page.$$eval('.games-list .game-row', (rows) => rows.length), 2);
    await page.goto(base + '/sessions.html');
    await page.click('#end-session-btn');
    await page.goto(base + '/session-history.html');
    await page.click('.history-summary');
    const historyRows = await page.$$eval('.games-list .game-row', (rows) => rows.map((row) => row.textContent));
    assert.strictEqual(historyRows.length, 2);
    assert(historyRows.every((row) => row.includes('won by')));
    assert.deepStrictEqual(errors, []);
    console.log('Six-player rotation, scoring, undo, reset, history and statistics: PASS');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})();
