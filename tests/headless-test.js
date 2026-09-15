const puppeteer = require('puppeteer');

(async () => {
  const base = 'http://localhost:8000';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    // 1) Visit index.html to trigger service worker registration
    await page.goto(base + '/index.html', { waitUntil: 'networkidle2' });

    // Wait for service worker controller to be present (if registered)
    await page.waitForFunction(() => ('serviceWorker' in navigator && (navigator.serviceWorker.controller || navigator.serviceWorker.getRegistration())) , { timeout: 15000 }).catch(() => {});
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Ensure SW script is accessible
    const swText = await page.evaluate(() => fetch('/service-worker.js').then(r => r.text()));

    // Read the current cache name out of the service worker itself, so this
    // assertion can't silently go stale the next time the version is bumped.
    const cacheMatch = swText.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
    const cacheTarget = cacheMatch ? cacheMatch[1] : null;

    // Check caches in page context.
    const cacheReport = await page.evaluate(async (target) => {
      try {
        const cacheNames = await caches.keys();
        const hasCache = !!target && cacheNames.indexOf(target) !== -1;
        let hasChart = false;
        let hasPlugin = false;
        if (hasCache) {
          const c = await caches.open(target);
          const matches = [
            '/js/chart.min.js',
            '/js/chartjs-plugin-datalabels.min.js',
            'js/chart.min.js',
            'js/chartjs-plugin-datalabels.min.js',
            './js/chart.min.js',
            './js/chartjs-plugin-datalabels.min.js'
          ];
          for (const k of matches) {
            const m = await c.match(k);
            if (m) {
              if (k.includes('chartjs-plugin')) hasPlugin = true;
              else hasChart = true;
            }
          }
        }
        return { cacheNames, hasCache, hasChart, hasPlugin };
      } catch (err) {
        return { error: err.message };
      }
    }, cacheTarget);

    console.log('Service worker file size:', swText.length);
    console.log('Expected cache name:', cacheTarget);
    console.log('Cache report:', cacheReport);

    // 2) Programmatically test 5-player session rotation fairness by
    // measuring how evenly each player appears in the 3-player pool.
    const rotationReport = await page.evaluate(() => {
      localStorage.removeItem('tichuPlayers');
      localStorage.removeItem('tichuSessions');
      localStorage.removeItem('tichuGames');
      localStorage.removeItem('tichuCurrentGameId');

      const names = ['P1','P2','P3','P4','P5'];
      names.forEach((n) => {
        try { TichuPlayers.addPlayer(n); } catch (e) {}
      });
      const players = TichuPlayers.getPlayers({ activeOnly: true }).map((p) => p.id);
      if (players.length !== 5) return { error: 'Failed to create 5 players', players };

      const res = TichuPlayers.startSession({ playerIds: players });
      const sessionId = res.session.id;
      const poolCounts = {};
      players.forEach((id) => { poolCounts[id] = 0; });

      const initialGame = res.game;
      if (initialGame && initialGame.mode === 'rotation') {
        initialGame.pool.forEach((id) => { poolCounts[id] = (poolCounts[id] || 0) + 1; });
        TichuPlayers.finishGame(initialGame.id, 'tie', { teamA: 0, teamB: 0 });
      }

      for (let i = 0; i < 9; i++) {
        const game = TichuPlayers.startNewGameInSession(sessionId);
        if (game.mode === 'rotation') {
          game.pool.forEach((id) => { poolCounts[id] = (poolCounts[id] || 0) + 1; });
        }
        TichuPlayers.finishGame(game.id, 'tie', { teamA: 0, teamB: 0 });
      }

      return {
        sessionId,
        poolCounts,
        totalGames: Object.values(poolCounts).reduce((sum, value) => sum + value, 0) / 5
      };
    });

    console.log('Rotation report:', rotationReport);

    let balanced = null;
    if (rotationReport && rotationReport.poolCounts) {
      const vals = Object.values(rotationReport.poolCounts);
      const mx = Math.max(...vals);
      const mn = Math.min(...vals);
      balanced = (mx - mn) <= 2;
    }

    console.log('Balanced pool participation (max-min â‰¤ 2)?', balanced);

    await browser.close();

    return { cacheReport, rotationReport, balanced };
  } catch (err) {
    console.error('Test failed:', err);
    await browser.close();
    process.exit(2);
  }
})();
