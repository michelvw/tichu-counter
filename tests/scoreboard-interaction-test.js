const puppeteer = require('puppeteer');

(async () => {
  const base = 'http://localhost:8000';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);
  // The reset flow now always asks for confirmation; accept it so the test
  // can verify the undo-restore path that follows.
  page.on('dialog', (d) => d.accept());

  async function boardState() {
    return page.evaluate(() => ({
      roundScores: TichuStorage.getRoundScores().length,
      pointsA: TichuStorage.getPoints('A'),
      pointsB: TichuStorage.getPoints('B'),
      round: TichuStorage.getRoundNumber(),
    }));
  }

  try {
    await page.goto(base + '/index.html', { waitUntil: 'networkidle2' });

    // Seed a clean board so the test starts from a known state.
    await page.evaluate(() => {
      TichuStorage.resetGame();
      localStorage.removeItem('tichuModeHintDismissed');
    });
    await page.reload({ waitUntil: 'networkidle2' });

    // Round 1: default +50 for Team A.
    await page.click('#btn-next');
    // Round 2: bump Team A by +5 (temp 55) and commit.
    await page.click('#A .plus');
    await page.click('#btn-next');

    const afterTwoRounds = await boardState();
    console.log('After 2 rounds:', JSON.stringify(afterTwoRounds));

    // Undo round 2: roundScores must drop back to 1 and A's total to 50.
    await page.click('#undo');
    const afterUndo = await boardState();
    console.log('After undo round 2:', JSON.stringify(afterUndo));

    // Reset now asks for confirmation (dialog auto-accepted), and the
    // snapshot it leaves behind must make Undo restore the whole board.
    await page.click('#reset');
    const afterReset = await boardState();
    console.log('After reset:', JSON.stringify(afterReset));
    await page.click('#undo');
    const afterResetUndo = await boardState();
    console.log('After undo of reset:', JSON.stringify(afterResetUndo));

    // Custom win threshold via the Apply button.
    await page.click('#win-threshold-button');
    await page.evaluate(() => {
      document.querySelector('#customWinThreshold').value = '750';
    });
    await page.click('#customWinThresholdApply');
    const thresholdApplied = await page.evaluate(() => ({
      winThreshold: TichuStorage.getWinThreshold(),
      buttonText: document.querySelector('#win-threshold-button').textContent,
    }));
    console.log('Threshold applied:', JSON.stringify(thresholdApplied));

    // Custom win threshold via Enter key in the input.
    await page.click('#win-threshold-button');
    await page.focus('#customWinThreshold');
    await page.keyboard.type('1000');
    await page.keyboard.press('Enter');
    const thresholdEntered = await page.evaluate(() => ({
      winThreshold: TichuStorage.getWinThreshold(),
      buttonText: document.querySelector('#win-threshold-button').textContent,
    }));
    console.log('Threshold via Enter:', JSON.stringify(thresholdEntered));

    const ok =
      afterTwoRounds.roundScores === 2 && afterTwoRounds.pointsA === 105 &&
      afterUndo.roundScores === 1 && afterUndo.pointsA === 50 &&
      afterReset.roundScores === 0 && afterReset.pointsA === 0 && afterReset.round === 1 &&
      afterResetUndo.roundScores === 1 && afterResetUndo.pointsA === 50 &&
      afterResetUndo.round === 2 &&
      thresholdApplied.winThreshold === 750 &&
      thresholdEntered.winThreshold === 1000;

    console.log('Scoreboard interaction checks passed?', ok);
    await browser.close();
    if (!ok) process.exit(2);
  } catch (err) {
    console.error('Test failed:', err);
    await browser.close();
    process.exit(2);
  }
})();