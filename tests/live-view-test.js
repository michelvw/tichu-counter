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
  fs.readFile(file, (err, body) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

const seed = {
  tichuCloudUser: 'viewer', tichuGuestModeActive: 'true',
  tichuSharedNames: JSON.stringify({ p1: 'Ann', p2: 'Bob', p3: 'Cy', p4: 'Di' }),
  tichuPlayers: '[]',
  tichuSessions: JSON.stringify([{ id: 's1', ownerUid: 'host', status: 'active', startedAt: 1, endedAt: null, playerIds: ['p1', 'p2', 'p3', 'p4'], nextPoolStart: 0, pauseLog: [] }]),
  tichuGames: JSON.stringify([{
    id: 'g1', ownerUid: 'host', sessionId: 's1', mode: 'fixed', teams: [['p1', 'p2'], ['p3', 'p4']], fixedTeam: [], pool: [],
    winThreshold: 500, winner: null, startedAt: 2, nextDealerPlayerId: 'p3',
    rounds: [{ roundNumber: 1, scores: [100, 60], activeTeams: [0, 1], tichuMods: [0, 0], doubleWins: [false, false], dealerPlayerId: 'p1' }],
  }]),
};

(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, r));
    const base = 'http://localhost:' + server.address().port + '/';
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => (/js\/cloud\.js/.test(r.url()) ? r.abort() : r.continue()));
    await page.goto(base + 'index.html');
    await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);

    await page.goto(base + 'index.html', { waitUntil: 'networkidle0' });
    const board = await page.evaluate(() => ({
      live: document.body.classList.contains('live-view'),
      a: document.querySelector('#A .points').textContent,
      b: document.querySelector('#B .points').textContent,
      nameA: document.getElementById('teamAName').value,
      nameB: document.getElementById('teamBName').value,
      round: document.getElementById('round-counter').textContent,
      tag: document.getElementById('session-tag-text').textContent,
      dealer: document.getElementById('dealer-tag-text').textContent,
      banner: !!document.getElementById('readonly-banner'),
      nextVisible: getComputedStyle(document.getElementById('btn-next')).display !== 'none',
      inputsVisible: getComputedStyle(document.querySelector('#A .input-fields')).display !== 'none',
      scoresHref: document.getElementById('round-scores').getAttribute('href'),
    }));
    assert.deepStrictEqual(
      { live: board.live, a: board.a, b: board.b, nameA: board.nameA, nameB: board.nameB, round: board.round, banner: board.banner, next: board.nextVisible, inputs: board.inputsVisible, dealer: board.dealer, href: board.scoresHref },
      { live: true, a: '100', b: '60', nameA: 'Ann & Bob', nameB: 'Cy & Di', round: 'Round 2', banner: true, next: false, inputs: false, dealer: 'Dealer: Cy', href: 'round-scores.html?game=g1' },
      JSON.stringify(board)
    );

    await page.goto(base + 'sessions.html', { waitUntil: 'networkidle0' });
    const sessions = await page.evaluate(() => ({
      text: document.getElementById('session-panel').textContent,
      scoreboardBtn: !!document.getElementById('view-scoreboard-btn'),
      startForm: !!document.getElementById('start-session-btn'),
      end: !!document.getElementById('end-session-btn'),
    }));
    assert(/Live shared session/.test(sessions.text) && /SHARED/.test(sessions.text), sessions.text);
    assert(sessions.scoreboardBtn && !sessions.startForm && !sessions.end, JSON.stringify(sessions));

    await page.evaluate(() => {
      const g = JSON.parse(localStorage.tichuGames);
      g[0].winner = 'A';
      g[0].pendingNextGame = false;
      localStorage.tichuGames = JSON.stringify(g);
    });
    await page.goto(base + 'sessions.html', { waitUntil: 'networkidle0' });
    const between = await page.evaluate(() => document.getElementById('session-panel').textContent);
    assert(/Waiting for the host/.test(between), between);
    console.log('Live view: PASS');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();



