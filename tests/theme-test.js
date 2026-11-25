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
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
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
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(base + '/index.html');
    assert.strictEqual(await page.$eval('html', (el) => el.dataset.theme), 'dark');
    await Promise.all([page.waitForNavigation(), page.click('#settings-link')]);
    assert.strictEqual(await page.$eval('#theme-picker', (el) => el.value), 'system');
    await page.select('#theme-picker', 'light');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    assert.strictEqual(await page.$eval('html', (el) => el.dataset.theme), 'light');

    for (const file of ['round-scores.html', 'sessions.html', 'players.html', 'player-stats.html', 'session-history.html', 'session-details.html', 'index.html']) {
      await page.goto(base + '/' + file);
      assert.strictEqual(await page.$eval('html', (el) => el.dataset.theme), 'light', file);
      assert.strictEqual(await page.$('#theme-picker'), null, file);
    }

    await page.goto(base + '/settings.html');
    await page.select('#theme-picker', 'dark');
    await page.goto(base + '/round-scores.html');
    assert.strictEqual(await page.$eval('html', (el) => el.dataset.theme), 'dark');
    const darkChart = await page.evaluate(() => ({
      background: scoreChart.options.plugins.customCanvasBackgroundColor.color,
      surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
      team: scoreChart.data.datasets[0].borderColor,
      teamColor: getComputedStyle(document.documentElement).getPropertyValue('--team-a').trim(),
      text: scoreChart.options.scales.x.ticks.color
    }));
    assert.strictEqual(darkChart.background, darkChart.surface);
    assert.strictEqual(darkChart.team, darkChart.teamColor);
    const settings = await browser.newPage();
    await settings.goto(base + '/settings.html');
    await settings.select('#theme-picker', 'light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.notStrictEqual(await page.evaluate(() => scoreChart.options.scales.x.ticks.color), darkChart.text);

    await settings.select('#theme-picker', 'system');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('tichuTheme')), null);
    await page.bringToFront();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.strictEqual(await page.evaluate(() => scoreChart.options.plugins.customCanvasBackgroundColor.color), darkChart.surface);
    await page.setViewport({ width: 800, height: 320 });
    const landscape = await page.$eval('#graph-container', (el) => getComputedStyle(el).backgroundColor);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.strictEqual(landscape, background);

    await page.evaluate(() => navigator.serviceWorker.ready);
    assert(await page.evaluate(async () => !!(await caches.match('./js/theme.js'))));
    await page.setOfflineMode(true);
    await page.goto(base + '/settings.html');
    assert.strictEqual(await page.$eval('html', (el) => el.dataset.theme), 'dark');
    assert.strictEqual(await page.$eval('#theme-picker', (el) => el.value), 'system');
    assert(await page.evaluate(async () => !!(await caches.match('./js/settings.js'))));
    console.log('Theme preference, navigation, chart, system changes and offline cache checks passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
