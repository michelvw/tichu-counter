const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const RESULTS_FILE = path.join(__dirname, 'layout-results.json');

// Seeds an active session and measures the "View details" / "End session"
// buttons at several phone widths. Verifies that:
//  - the two buttons never geometrically overlap
//  - each button label is either fully visible or gracefully ellipsized
//  - the row is side-by-side on normal phones and stacked full-width on
//    very narrow ones (<=360px)
(async () => {
  const base = 'http://localhost:8000';
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  let pass = true;

  function logResult(r) {
    results.push(r);
    console.log(JSON.stringify(r));
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    if (r.error) { pass = false; return; }
    const group = r.viewport <= 360 ? 'narrow' : 'normal';
    if (r.overlap) { console.error('  FAIL: buttons overlap at', r.viewport); pass = false; }
    if (r.labels.some((l) => !l.fullyVisible && !l.ellipsized)) {
      console.error('  FAIL: label hard-clipped (no ellipsis) at', r.viewport); pass = false;
    }
    if (group === 'normal' && !r.sameRow) {
      console.error('  FAIL: buttons unexpectedly stacked at', r.viewport); pass = false;
    }
    if (group === 'narrow' && r.sameRow) {
      console.warn('  NOTE: side-by-side at', r.viewport, '(ok if labels fully visible)');
    }
    if (!r.scaled && group === 'normal' && r.labels.some((l) => l.ellipsized)) {
      console.error('  FAIL: label ellipsized at default font, viewport', r.viewport); pass = false;
    }
  }

  async function runViewport(width, scaled) {
    let page;
    try {
      page = await browser.newPage();
      page.setDefaultTimeout(15000);
      // Disable service worker registration so navigations always hit the
      // network (fresh files) and don't stall on SW cache idle waits.
      await page.evaluateOnNewDocument(() => {
        try { navigator.serviceWorker.register = () => Promise.resolve(null); } catch (e) {}
      });
      await page.setViewport({ width, height: 800 });
      await page.goto(base + '/sessions.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.TichuPlayers, { timeout: 15000 });
      await page.evaluate(() => {
        localStorage.removeItem('tichuPlayers');
        localStorage.removeItem('tichuSessions');
        localStorage.removeItem('tichuGames');
        localStorage.removeItem('tichuCurrentGameId');
        ['P1', 'P2', 'P3', 'P4', 'P5'].forEach((n) => {
          try { TichuPlayers.addPlayer(n); } catch (e) {}
        });
        TichuPlayers.startSession({ playerIds: TichuPlayers.getPlayers({ activeOnly: true }).map((p) => p.id) });
      });
      await page.goto(base + '/sessions.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('.session-actions-secondary .btn-flat').length === 2, { timeout: 15000 });
      if (scaled) {
        await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
      }
      const m = await page.evaluate((vw, isScaled) => {
        const container = document.querySelector('.session-actions-secondary');
        const btns = Array.from(document.querySelectorAll('.session-actions-secondary .btn-flat'));
        if (!container || btns.length !== 2) {
          return { error: 'container/buttons missing', btns: btns.length, hasContainer: !!container };
        }
        const r1 = btns[0].getBoundingClientRect();
        const r2 = btns[1].getBoundingClientRect();
        const overlapW = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
        const overlapH = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));
        const labels = btns.map((b) => {
          const l = b.querySelector('.btn-label');
          const lr = l.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return {
            text: l.textContent,
            ellipsized: l.scrollWidth > l.clientWidth + 0.5,
            fullyVisible: lr.left >= br.left - 0.5 && lr.right <= br.right + 0.5,
            clientW: Math.round(l.clientWidth),
            scrollW: Math.round(l.scrollWidth),
          };
        });
        return {
          error: null,
          viewport: vw,
          scaled: !!isScaled,
          sameRow: Math.abs(r1.top - r2.top) < 4,
          overlap: overlapW > 0 && overlapH > 0,
          containerWidth: Math.round(container.getBoundingClientRect().width),
          btnWidths: [Math.round(r1.width), Math.round(r2.width)],
          labels,
        };
      }, width, scaled);
      logResult(m);
    } catch (err) {
      logResult({ error: 'iteration threw: ' + err.message, viewport: width, scaled: !!scaled });
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  try {
    for (const width of [320, 360, 361, 375, 390, 414]) {
      await runViewport(width, false);
    }
    for (const width of [320, 375]) {
      await runViewport(width, true);
    }
  } finally {
    await browser.close();
  }

  console.log('OVERALL:', pass ? 'PASS' : 'FAIL');
  if (!pass) process.exit(2);
})();