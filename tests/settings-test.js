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
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let accept = false;
    let confirmations = 0;
    page.on('dialog', (dialog) => {
      confirmations++;
      return accept ? dialog.accept() : dialog.dismiss();
    });
    const openSettings = () => Promise.all([page.waitForNavigation(), page.click('#settings-link')]);
    const back = () => Promise.all([page.waitForNavigation(), page.click('a[aria-label="Back to scoreboard"]')]);
    const save = () => page.click('#win-threshold-form button');
    const target = () => page.evaluate(() => TichuStorage.getWinThreshold());

    await page.goto(base + '/index.html');
    const nav = await page.$$eval('nav a', (links) => links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    assert(nav.every((rect) => rect.left >= 0 && rect.right <= 320 && rect.width >= 44));
    await openSettings();
    assert.strictEqual(await page.$eval('#win-threshold', (el) => el.value), '500');
    await page.select('#win-threshold', '300');
    await save();
    assert.strictEqual(await target(), 300);
    assert.strictEqual(confirmations, 0, 'a fresh board does not require confirmation');
    await page.select('#win-threshold', 'custom');
    await page.$eval('#custom-win-threshold', (el) => { el.value = '0'; });
    await save();
    assert.strictEqual(await target(), 300);
    assert.match(await page.$eval('#threshold-status', (el) => el.textContent), /positive whole number/);
    await back();
    assert.strictEqual(await page.$eval('#progress-goal-marker-label', (el) => el.textContent), '300');

    await page.click('#A .plus');
    await page.click('#btn-next');
    await page.click('#A .plus');
    await openSettings();
    await page.select('#win-threshold', 'custom');
    await page.$eval('#custom-win-threshold', (el) => { el.value = '50'; });
    await save();
    assert.strictEqual(confirmations, 1);
    assert.strictEqual(await target(), 300);
    assert.strictEqual(await page.$eval('#win-threshold', (el) => el.value), '300');
    accept = true;
    await page.select('#win-threshold', 'custom');
    await page.$eval('#custom-win-threshold', (el) => { el.value = '50'; });
    await save();
    assert.strictEqual(await target(), 50);
    await back();
    assert.strictEqual(await page.$eval('#progress-goal-marker-label', (el) => el.textContent), '50');
    assert.match(await page.$eval('#win-banner-text', (el) => el.textContent), /Team A.*50/);
    assert.strictEqual(await page.$eval('#A .temp-points', (el) => el.textContent), '55', 'draft round survives settings');
    await page.click('#undo');
    assert.strictEqual(await page.evaluate(() => TichuStorage.getRoundScores().length), 0, 'undo survives settings');

    const other = await browser.newPage();
    await other.goto(base + '/settings.html');
    await other.select('#win-threshold', '750');
    await other.click('#win-threshold-form button');
    await page.waitForFunction(() => document.querySelector('#progress-goal-marker-label').textContent === '750');
    await other.close();

    await page.evaluate(() => {
      TichuStorage.resetGame();
      TichuStorage.setWinThreshold(500);
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((name) => TichuPlayers.addPlayer(name));
    });
    await page.goto(base + '/sessions.html');
    for (const label of await page.$$('.player-pick-row label')) await label.click();
    await Promise.all([page.waitForNavigation(), page.click('#start-session-btn')]);
    assert.strictEqual(await page.$eval('.three-team-target', (el) => el.textContent), 'Goal: 500');
    await page.click('#btn-next');
    await page.click('#btn-next');
    assert.strictEqual(await page.evaluate(() => TichuPlayers.getCurrentGame().winner), null);
    await openSettings();
    await page.select('#win-threshold', 'custom');
    await page.$eval('#custom-win-threshold', (el) => { el.value = '50'; });
    await save();
    assert(await page.evaluate(() => TichuPlayers.getCurrentGame().winner), 'lowering the target finishes a six-player game with a sole leader');
    assert.match(await page.$eval('#threshold-status', (el) => el.textContent), /winner/);
    await page.select('#win-threshold', '750');
    await save();
    assert.strictEqual(await target(), 50, 'a finished six-player target cannot be changed');
    assert.match(await page.$eval('#threshold-status', (el) => el.textContent), /undo the winning round/);
    await back();
    assert.strictEqual(await page.$eval('#btn-next', (el) => el.getAttribute('aria-disabled')), 'true');
    assert.strictEqual(await page.$eval('.three-team-target', (el) => el.textContent), 'Goal: 50');
    await page.click('#undo');
    assert.strictEqual(await page.evaluate(() => TichuPlayers.getCurrentGame().winner), null);
    assert.deepStrictEqual(errors, []);
    console.log('Settings validation, confirmation, draft, undo and six-player winner checks passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
