const puppeteer = require('puppeteer');

// Exercises the dealer-of-the-round logic in js/players-storage.js:
//  - the dealer is always one of the four players active in that round
//    (never the player who sits out);
//  - the dealing team alternates between consecutive rounds, including
//    across the boundary between two games of the same session;
//  - each player's cumulative deal count across the session stays as even
//    as possible;
//  - the stored dealer pointer survives a reload and Undo rewinds it.

(async () => {
  const base = 'http://localhost:8000';
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto(base + '/index.html', { waitUntil: 'networkidle2' });

    const report = await page.evaluate(() => {
      function assert(cond, label) {
        if (!cond) throw new Error('Assertion failed: ' + label);
      }

      function clearAll() {
        localStorage.removeItem('tichuPlayers');
        localStorage.removeItem('tichuSessions');
        localStorage.removeItem('tichuGames');
        localStorage.removeItem('tichuCurrentGameId');
      }

      // Which side a player is on for a given game ('A'/'B').
      function teamOf(game, pid) {
        if (game.mode === 'rotation') {
          return game.fixedTeam.indexOf(pid) !== -1 ? 'A' : 'B';
        }
        return game.teams[0].indexOf(pid) !== -1 ? 'A' : 'B';
      }

      // Plays `roundsPerGame` rounds in each of `gameCount` consecutive
      // games of one session, checking the dealer rules as it goes.
      function runSession(playerCount, roundsPerGame, gameCount) {
        const names = ['P1', 'P2', 'P3', 'P4', 'P5'].slice(0, playerCount);
        clearAll();
        names.forEach((n) => { try { TichuPlayers.addPlayer(n); } catch (e) {} });
        const players = TichuPlayers.getPlayers({ activeOnly: true }).map((p) => p.id);
        const session = TichuPlayers.startSession({ playerIds: players });
        const sessionId = session.session.id;
        const counts = {};
        players.forEach((p) => { counts[p] = 0; });

        let prevDealerId = null; // dealer of the most recent recorded round anywhere

        for (let g = 0; g < gameCount; g++) {
          let game = TichuPlayers.getCurrentGame();
          assert(game !== null, 'a game is in progress');

          for (let r = 0; r < roundsPerGame; r++) {
            game = TichuPlayers.getCurrentGame(); // fresh copy from storage
            const roundNumber = game.rounds.length + 1;
            const lineup = TichuPlayers.getRoundLineup(game, roundNumber);
            const dealerId = TichuPlayers.getCurrentRoundDealer(game);

            assert(dealerId, 'dealer is known for round ' + roundNumber);
            assert(
              lineup.teamA.indexOf(dealerId) !== -1 || lineup.teamB.indexOf(dealerId) !== -1,
              'dealer is playing this round'
            );
            if (lineup.sittingOut) {
              assert(dealerId !== lineup.sittingOut, 'sitting-out player never deals');
            }
            if (prevDealerId) {
              assert(
                teamOf(game, prevDealerId) !== teamOf(game, dealerId),
                'dealing team alternates every round'
              );
            }
            counts[dealerId] = (counts[dealerId] || 0) + 1;

            TichuPlayers.recordRound(game.id, {
              teamAPoints: 0,
              teamBPoints: 0,
              teamATichuMod: 0,
              teamBTichuMod: 0,
              teamADoubleWin: false,
              teamBDoubleWin: false,
              sittingOutPlayerId: lineup.sittingOut,
              dealerPlayerId: dealerId,
            });
            prevDealerId = dealerId;
          }

          // Reload stability: the client always reads the dealer for the
          // upcoming round back from storage, so it must be persisted.
          const reloaded = TichuPlayers.getGame(game.id);
          assert(
            TichuPlayers.getCurrentRoundDealer(reloaded) === reloaded.nextDealerPlayerId,
            'dealer pointer survives reload'
          );

          // Undo: popping the last round must bring back that round as the
          // dealer shown for the round we're now on again.
          const lastRound = reloaded.rounds[reloaded.rounds.length - 1];
          TichuPlayers.unrecordRound(reloaded.id);
          const afterUndo = TichuPlayers.getGame(reloaded.id);
          assert(
            TichuPlayers.getCurrentRoundDealer(afterUndo) === lastRound.dealerPlayerId,
            "undo restores the undone round's dealer"
          );
          // Re-record the popped round so history stays consistent.
          TichuPlayers.recordRound(afterUndo.id, lastRound);

          if (g < gameCount - 1) {
            TichuPlayers.finishGame(game.id, 'tie', { teamA: 0, teamB: 0 });
            const next = TichuPlayers.startNewGameInSession(sessionId);
            const firstDealer = TichuPlayers.getCurrentRoundDealer(next);
            assert(firstDealer, 'first dealer of a new game is known');
            // prevDealerId is still the previous game's last deal.
            assert(
              teamOf(next, prevDealerId) !== teamOf(next, firstDealer),
              'starting team alternates across games'
            );
          }
        }

        const vals = players.map((p) => counts[p]);
        return {
          playerCount,
          rounds: gameCount * roundsPerGame,
          counts,
          min: Math.min(...vals),
          max: Math.max(...vals),
        };
      }

      // 5-player rotation: pool members sit out a third of the rounds, so
      // absolute counts can differ by 2 while still being as fair as the
      // sitting-out rotation physically allows.
      const five = runSession(5, 8, 3);
      // 4-player fixed: everyone is at every table, so counts must be
      // perfectly balanced (max - min <= 1).
      const four = runSession(4, 10, 3);
      return { five, four };
    });

    console.log('Dealer report (5-player rotation):', JSON.stringify(report.five));
    console.log('Dealer report (4-player fixed):', JSON.stringify(report.four));

    const fiveBalanced = report.five.max - report.five.min <= 2;
    const fourBalanced = report.four.max - report.four.min <= 1;
    console.log('5-player deal counts balanced (max-min <= 2)?', fiveBalanced);
    console.log('4-player deal counts balanced (max-min <= 1)?', fourBalanced);

    await browser.close();

    if (!fiveBalanced || !fourBalanced) {
      console.error('Deal counts are not balanced enough.');
      process.exit(2);
    }
  } catch (err) {
    console.error('Test failed:', err);
    await browser.close();
    process.exit(2);
  }
})();