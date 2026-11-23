// Verifies per-session "Player statistics" render on both the active
// session details page (session-details.html) and historical session rows
// (sessions.html history detail), mirroring the all-time ranking on
// players.html: a ranking grid plus a "Sort ranking by" dropdown. Uses a
// single page, hard timeouts, and in-page error capture so any failure is
// reported to the results file.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:8000';
const OUT = path.join(__dirname, 'player-session-stats-out.json');
const results = [];

function log(o) {
  results.push(o);
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(o));
}
process.on('unhandledRejection', (e) => { log({ unhandled: e && e.message }); process.exit(2); });
setTimeout(() => { log({ watchdog: 'elapsed' }); process.exit(3); }, 45000);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('STEP TIMEOUT: ' + label)), ms)),
  ]);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + (e && e.message)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
    await page.evaluateOnNewDocument(() => {
      try { navigator.serviceWorker.register = () => Promise.resolve(null); } catch (e) {}
    });

    async function seed(names, spec, endIt, inProgress) {
      await withTimeout(page.evaluate((playerNames, gamesSpec, ended, extra) => {
        ['tichuPlayers', 'tichuSessions', 'tichuGames', 'tichuCurrentGameId'].forEach((k) => localStorage.removeItem(k));
        playerNames.forEach((n) => TichuPlayers.addPlayer(n));
        const players = TichuPlayers.getPlayers({ activeOnly: true }).map((p) => p.id);
        const res = TichuPlayers.startSession({ playerIds: players });
        const sessionId = res.session.id;
        const actual = [];
        let current = res.game;
        gamesSpec.forEach((s, i) => {
          if (i > 0) current = TichuPlayers.startNewGameInSession(sessionId);
          TichuPlayers.finishGame(current.id, s.winner, s.finalScores);
          actual.push({ id: current.id });
        });
        if (extra) TichuPlayers.startNewGameInSession(sessionId);
        if (ended) TichuPlayers.endSession(sessionId);
        // Rewrite finished games with the exact teams/rounds we want.
        const games = JSON.parse(localStorage.getItem('tichuGames') || '[]');
        games.forEach((g) => {
          const si = actual.findIndex((a) => a.id === g.id);
          if (si !== -1) {
            const s = gamesSpec[si];
            g.teams = s.teams.map((t) => t.map((pi) => players[pi]));
            g.rounds = s.rounds;
          }
        });
        localStorage.setItem('tichuGames', JSON.stringify(games));
        return { sessionId, players };
      }, names, spec.map((s) => ({ winner: s.winner, finalScores: s.finalScores, teams: s.teams, rounds: s.rounds })), endIt, inProgress), 15000, 'seed');
    }

    // Historical (ended) session: A wins game 1 (100-85, one Grand Tichu,
    // one Tichu, one double win for team A); B wins game 2 (95-120).
    const histSpec = [
      {
        winner: 'A',
        finalScores: { teamA: 100, teamB: 85 },
        teams: [[0, 1], [2, 3]],
        rounds: [
          { teamAPoints: 40, teamBPoints: 5, teamATichuMod: 200, teamBTichuMod: 0, teamADoubleWin: true, teamBDoubleWin: false, sittingOutPlayerId: null },
          { teamAPoints: 0, teamBPoints: 35, teamATichuMod: 0, teamBTichuMod: 0, teamADoubleWin: false, teamBDoubleWin: false, sittingOutPlayerId: null },
          { teamAPoints: 60, teamBPoints: 45, teamATichuMod: 100, teamBTichuMod: -100, teamADoubleWin: false, teamBDoubleWin: false, sittingOutPlayerId: null },
        ],
      },
      {
        winner: 'B',
        finalScores: { teamA: 95, teamB: 120 },
        teams: [[0, 2], [1, 3]],
        rounds: [
          { teamAPoints: 30, teamBPoints: 40, teamATichuMod: 0, teamBTichuMod: 100, teamADoubleWin: false, teamBDoubleWin: false, sittingOutPlayerId: null },
          { teamAPoints: 65, teamBPoints: 80, teamATichuMod: 0, teamBTichuMod: 0, teamADoubleWin: false, teamBDoubleWin: true, sittingOutPlayerId: null },
        ],
      },
    ];

    // 1. Load a page with TichuPlayers available, seed the historical session.
    await withTimeout(page.goto(BASE + '/session-details.html', { waitUntil: 'domcontentloaded' }), 15000, 'goto-details');
    await withTimeout(page.waitForFunction(() => !!window.TichuPlayers), 15000, 'wait-players');
    await seed(['P1', 'P2', 'P3', 'P4'], histSpec, true, false);
    const histExpected = await withTimeout(page.evaluate(() => {
      const sid = TichuPlayers.getSessions()[0].id;
      const p1 = TichuPlayers.getPlayers({ activeOnly: true })[0].id;
      return {
        completedGames: TichuPlayers.getSessionGames(sid).filter((g) => g.winner).length,
        p1Stats: TichuPlayers.computePlayerSessionStats(p1, sid),
      };
    }), 15000, 'hist-expected');
    log({ stage: 'historical-seed', histExpected });

    // 2. Open session-history.html, expand the history row, read the ranking
    //    grid and the sort dropdown.
    await withTimeout(page.goto(BASE + '/session-history.html', { waitUntil: 'domcontentloaded' }), 15000, 'goto-sessions');
    await withTimeout(page.waitForFunction(() => document.querySelectorAll('.history-item').length >= 1), 15000, 'wait-history');
    const histUi = await withTimeout(page.evaluate(() => {
      const summary = document.querySelector('.history-summary');
      if (summary) summary.click();
      const section = document.querySelector('.session-player-stats');
      const select = section ? section.querySelector('.ranking-sort select') : null;
      return {
        heading: (section ? section.querySelector('h5') : null || {}).textContent || '',
        hasOldStandings: !!document.querySelector('.leaderboard-list'),
        sort: {
          label: (section ? section.querySelector('.ranking-sort label') : null || {}).textContent || '',
          value: select ? select.value : null,
          options: select ? Array.from(select.options).map((o) => o.textContent) : [],
          rows: section ? Array.from(section.querySelectorAll('.ranking-row')).map((r) => ({
            pos: r.querySelector('.ranking-position') ? r.querySelector('.ranking-position').textContent : '?',
            name: r.querySelector('.ranking-player-name') ? r.querySelector('.ranking-player-name').textContent : '?',
            value: r.querySelector('.ranking-value') ? r.querySelector('.ranking-value').textContent : '?',
          })) : [],
        },
      };
    }), 15000, 'read-history');
    log({ stage: 'history-ui', histUi });

    // 2b. Change the sort dropdown and confirm the grid re-ranks by the new metric.
    const histSorted = await withTimeout(page.evaluate(() => {
      const select = document.querySelector('.session-player-stats .ranking-sort select');
      if (!select) return { error: 'no sort select' };
      select.value = 'winRate';
      select.dispatchEvent(new Event('change'));
      const section = document.querySelector('.session-player-stats');
      return {
        label: (section ? section.querySelector('.ranking-sort label') : null || {}).textContent || '',
        value: select.value,
        options: Array.from(select.options).map((o) => o.textContent),
        rows: section ? Array.from(section.querySelectorAll('.ranking-row')).map((r) => ({
          pos: r.querySelector('.ranking-position') ? r.querySelector('.ranking-position').textContent : '?',
          name: r.querySelector('.ranking-player-name') ? r.querySelector('.ranking-player-name').textContent : '?',
          value: r.querySelector('.ranking-value') ? r.querySelector('.ranking-value').textContent : '?',
        })) : [],
      };
    }), 15000, 'sort-history');
    log({ stage: 'history-sort-winRate', histSorted });

    // 3. Seed an ACTIVE session, then load session-details.html and check.
    await seed(['Alice', 'Bob', 'Carol', 'Dave'], [
      {
        winner: 'A',
        finalScores: { teamA: 70, teamB: 30 },
        teams: [[0, 1], [2, 3]],
        rounds: [
          { teamAPoints: 70, teamBPoints: 30, teamATichuMod: 100, teamBTichuMod: 0, teamADoubleWin: true, teamBDoubleWin: false, sittingOutPlayerId: null },
        ],
      },
    ], false, false);
    await withTimeout(page.goto(BASE + '/session-details.html', { waitUntil: 'domcontentloaded' }), 15000, 'goto-details-active');
    await withTimeout(page.waitForFunction(() => document.querySelectorAll('.session-player-stats .ranking-row').length >= 4), 15000, 'wait-rows-active');
    const actUi = await withTimeout(page.evaluate(() => {
      const section = document.querySelector('.session-player-stats');
      const select = section ? section.querySelector('.ranking-sort select') : null;
      return {
        heading: (section ? section.querySelector('h5') : null || {}).textContent || '',
        hasOldStandings: !!document.querySelector('.leaderboard-list'),
        sort: {
          label: (section ? section.querySelector('.ranking-sort label') : null || {}).textContent || '',
          value: select ? select.value : null,
          options: select ? Array.from(select.options).map((o) => o.textContent) : [],
          rows: section ? Array.from(section.querySelectorAll('.ranking-row')).map((r) => ({
            pos: r.querySelector('.ranking-position') ? r.querySelector('.ranking-position').textContent : '?',
            name: r.querySelector('.ranking-player-name') ? r.querySelector('.ranking-player-name').textContent : '?',
            value: r.querySelector('.ranking-value') ? r.querySelector('.ranking-value').textContent : '?',
          })) : [],
        },
      };
    }), 15000, 'read-active');
    log({ stage: 'active-details-ui', actUi });
    log({ stage: 'page-errors', pageErrors });
  } catch (err) {
    log({ fatal: err.message, stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : '' });
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
})();