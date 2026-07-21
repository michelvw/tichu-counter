/**
 * TichuPlayers: storage layer for the optional player-roster / sessions
 * feature (see sessions-players-requirements.md). Kept as a completely
 * separate module from TichuStorage on purpose:
 *
 *  - TichuStorage owns the "one game at a time" scoreboard state used by
 *    Quick Game (and, while a session game is in progress, also used as
 *    the live scoreboard for that game — see recordRound below).
 *  - TichuPlayers owns the relational data (players / sessions / games /
 *    rounds) that accumulates indefinitely across game nights.
 *
 * Phase 1 covered: player roster (add/rename/archive) + a session with
 * one fixed team split for the life of a game.
 * Phase 2 added: 5-player sessions, where one team of 2 is fixed and the
 * other 3 players form a rotating pool (one sits out each round, strict
 * round-robin).
 * Phase 3 added: repeat-pairing avoidance for each new game after a
 * session's first (previewLineupForSession).
 * Phase 4 adds: statistics -- per-player-per-session, per-session
 * (leaderboard + duration), and per-player all-time aggregates.
 *
 * Storage is plain localStorage/JSON for now, structured so it maps
 * cleanly onto the players/sessions/games/rounds shape in the
 * requirements doc. Phase 5 may move this to IndexedDB if localStorage
 * starts to strain; nothing outside this file should need to change
 * when that happens.
 */
(function (global) {
  "use strict";

  var KEYS = {
    PLAYERS: "tichuPlayers",
    SESSIONS: "tichuSessions",
    GAMES: "tichuGames",
    CURRENT_GAME_ID: "tichuCurrentGameId",
  };

  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      return [];
    }
  }
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function makeId(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // ---- Players -----------------------------------------------------

  function getPlayers(opts) {
    var players = readJSON(KEYS.PLAYERS);
    if (opts && opts.activeOnly) {
      players = players.filter(function (p) { return p.active; });
    }
    return players;
  }

  function getPlayer(id) {
    return getPlayers().filter(function (p) { return p.id === id; })[0] || null;
  }

  function addPlayer(name) {
    name = (name || "").trim();
    if (!name) throw new Error("Player name can't be empty.");
    var players = readJSON(KEYS.PLAYERS);
    var player = { id: makeId("p"), name: name, active: true, createdAt: Date.now() };
    players.push(player);
    writeJSON(KEYS.PLAYERS, players);
    return player;
  }

  function renamePlayer(id, name) {
    name = (name || "").trim();
    if (!name) throw new Error("Player name can't be empty.");
    var players = readJSON(KEYS.PLAYERS);
    var player = players.filter(function (p) { return p.id === id; })[0];
    if (!player) throw new Error("Player not found.");
    player.name = name;
    writeJSON(KEYS.PLAYERS, players);
    return player;
  }

  function setPlayerActive(id, active) {
    var players = readJSON(KEYS.PLAYERS);
    var player = players.filter(function (p) { return p.id === id; })[0];
    if (!player) throw new Error("Player not found.");
    player.active = !!active;
    writeJSON(KEYS.PLAYERS, players);
    return player;
  }

  function archivePlayer(id) { return setPlayerActive(id, false); }
  function unarchivePlayer(id) { return setPlayerActive(id, true); }

  function teamNameString(playerIds) {
    return playerIds
      .map(function (id) { var p = getPlayer(id); return p ? p.name : "?"; })
      .join(" & ");
  }

  // ---- Sessions -------------------------------------------------------

  function getSessions() {
    return readJSON(KEYS.SESSIONS);
  }

  function getSession(id) {
    return getSessions().filter(function (s) { return s.id === id; })[0] || null;
  }

  function saveSession(session) {
    var sessions = getSessions();
    var idx = sessions.findIndex(function (s) { return s.id === session.id; });
    if (idx === -1) sessions.push(session);
    else sessions[idx] = session;
    writeJSON(KEYS.SESSIONS, sessions);
  }

  // Only one session may be active or paused at a time.
  function getActiveOrPausedSession() {
    return getSessions().filter(function (s) { return s.status === "active" || s.status === "paused"; })[0] || null;
  }

  function getSessionHistory() {
    return getSessions()
      .filter(function (s) { return s.status === "ended"; })
      .sort(function (a, b) { return b.endedAt - a.endedAt; });
  }

  function startSession(opts) {
    opts = opts || {};
    var playerIds = opts.playerIds || [];
    if (getActiveOrPausedSession()) {
      throw new Error("A session is already active or paused. End it before starting a new one.");
    }
    // v1/v2: exactly 4 (fixed teams) or 5 (rotating pool) distinct players.
    if ((playerIds.length !== 4 && playerIds.length !== 5) || new Set(playerIds).size !== playerIds.length) {
      throw new Error("Sessions need exactly 4 or 5 distinct players in this version.");
    }
    var session = {
      id: makeId("s"),
      name: (opts.name || "").trim() || null,
      status: "active",
      startedAt: Date.now(),
      endedAt: null,
      playerIds: playerIds,
      // Logs {pausedAt, resumedAt} pairs so session duration stats can
      // exclude paused time (see computeSessionStats).
      pauseLog: [],
    };
    saveSession(session);
    var game = startNewGameInSession(session.id, opts.lineup);
    return { session: session, game: game };
  }

  // Returns a random lineup for the UI to preview (and let the user
  // reshuffle) before committing to it via startSession/
  // startNewGameInSession's optional `lineup` override.
  //
  // 4 players -> {mode: 'fixed', teams: [[a,b],[c,d]]} — two fixed
  // teams for the whole game.
  // 5 players -> {mode: 'rotation', fixedTeam: [a,b], pool: [c,d,e]} —
  // one team of 2 always plays; the pool of 3 rotates who sits out
  // each round (see getRoundLineup below).
  function previewLineup(playerIds) {
    var shuffled = shuffle(playerIds);
    if (playerIds.length === 4) {
      return { mode: "fixed", teams: [shuffled.slice(0, 2), shuffled.slice(2, 4)] };
    }
    if (playerIds.length === 5) {
      return { mode: "rotation", fixedTeam: shuffled.slice(0, 2), pool: shuffled.slice(2, 5) };
    }
    throw new Error("Sessions support 4 or 5 players in this version.");
  }

  function sameIdSet(a, b) {
    var x = a.slice().sort();
    var y = b.slice().sort();
    return JSON.stringify(x) === JSON.stringify(y);
  }

  function isValidLineupFor(playerIds, lineup) {
    if (!lineup) return false;
    if (lineup.mode === "fixed") {
      if (playerIds.length !== 4) return false;
      if (!lineup.teams || lineup.teams.length !== 2 || lineup.teams[0].length !== 2 || lineup.teams[1].length !== 2) return false;
      return sameIdSet(playerIds, lineup.teams[0].concat(lineup.teams[1]));
    }
    if (lineup.mode === "rotation") {
      if (playerIds.length !== 5) return false;
      if (!lineup.fixedTeam || lineup.fixedTeam.length !== 2) return false;
      if (!lineup.pool || lineup.pool.length !== 3) return false;
      return sameIdSet(playerIds, lineup.fixedTeam.concat(lineup.pool));
    }
    return false;
  }

  // Resolves who's actually at the table for a given round of a game:
  // {teamA, teamB, sittingOut}. For a fixed-team (4-player) game this
  // is the same every round. For a rotation (5-player) game, teamB is
  // whichever 2 of the pool aren't sitting out this round — strict
  // round-robin on (roundNumber - 1) % 3, so it cycles evenly no matter
  // how many rounds the game runs.
  function getRoundLineup(game, roundNumber) {
    if (game.mode === "rotation") {
      var idx = (roundNumber - 1) % 3;
      var sittingOut = game.pool[idx];
      var activePool = game.pool.filter(function (id) { return id !== sittingOut; });
      return { teamA: game.fixedTeam, teamB: activePool, sittingOut: sittingOut };
    }
    // Fixed mode (also the fallback for legacy games saved before the
    // `mode` field existed, which only ever had `teams`).
    return { teamA: game.teams[0], teamB: game.teams[1], sittingOut: null };
  }

  function pairKey(a, b) {
    return [a, b].sort().join("|");
  }

  // Every distinct 4-player split (there are exactly 3, since fixing
  // player[0]'s partner determines the whole split).
  function fourPlayerSplits(playerIds) {
    var anchor = playerIds[0];
    var rest = playerIds.slice(1);
    return rest.map(function (partner, i) {
      var others = rest.filter(function (id, idx) { return idx !== i; });
      return { mode: "fixed", teams: [[anchor, partner], others] };
    });
  }

  // Every distinct 5-player lineup (10 = choose 2 of 5 for the fixed
  // team; the remaining 3 are the pool).
  function fivePlayerLineups(playerIds) {
    var lineups = [];
    for (var i = 0; i < playerIds.length; i++) {
      for (var j = i + 1; j < playerIds.length; j++) {
        var fixedTeam = [playerIds[i], playerIds[j]];
        var pool = playerIds.filter(function (id) { return id !== fixedTeam[0] && id !== fixedTeam[1]; });
        lineups.push({ mode: "rotation", fixedTeam: fixedTeam, pool: pool });
      }
    }
    return lineups;
  }

  // How many times each pair of players has actually played together
  // this session, counted from the session's finished games. Fixed-mode
  // games contribute their two team pairings once each; rotation-mode
  // games contribute their fixed pairing once, plus one occurrence per
  // recorded round for whichever two pool members played that round
  // (reconstructed from each round's sittingOutPlayerId).
  function sessionPairingCounts(sessionId) {
    var counts = {};
    function bump(a, b) {
      var k = pairKey(a, b);
      counts[k] = (counts[k] || 0) + 1;
    }
    getSessionGames(sessionId).forEach(function (g) {
      if (!g.winner) return; // skip anything not actually finished
      if (g.mode === "rotation") {
        bump(g.fixedTeam[0], g.fixedTeam[1]);
        (g.rounds || []).forEach(function (r) {
          if (!r.sittingOutPlayerId) return;
          var active = g.pool.filter(function (id) { return id !== r.sittingOutPlayerId; });
          if (active.length === 2) bump(active[0], active[1]);
        });
      } else {
        bump(g.teams[0][0], g.teams[0][1]);
        bump(g.teams[1][0], g.teams[1][1]);
      }
    });
    return counts;
  }

  // Sum of past-occurrence counts for every pairing a candidate lineup
  // implies -- the two team pairings for a fixed-mode split, or the
  // fixed pairing plus all 3 potential pool pairings for a rotation
  // lineup (since any two pool members may end up teamed together
  // depending on the round).
  function scoreLineup(lineup, counts) {
    function get(a, b) { return counts[pairKey(a, b)] || 0; }
    if (lineup.mode === "fixed") {
      return get(lineup.teams[0][0], lineup.teams[0][1]) + get(lineup.teams[1][0], lineup.teams[1][1]);
    }
    var p = lineup.pool;
    return get(lineup.fixedTeam[0], lineup.fixedTeam[1]) + get(p[0], p[1]) + get(p[0], p[2]) + get(p[1], p[2]);
  }

  // The session-aware version of previewLineup: the first game of a
  // session is still a pure random split (previewLineup), but every
  // game after that is biased against pairings that have already
  // occurred this session -- enumerate every valid split/lineup for
  // the player count, score each by how often its pairings have
  // already happened, keep only the minimum-score ones, and pick
  // randomly among those. With only 4 players there are just 3
  // distinct pairings total, so repeats become unavoidable after 3
  // games -- this naturally cycles back to the least-recently-repeated
  // option rather than erroring, since it's still just "minimum score".
  function previewLineupForSession(sessionId) {
    var session = getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    var playerIds = session.playerIds;
    var hasPriorGames = getSessionGames(sessionId).some(function (g) { return g.winner; });
    if (!hasPriorGames) return previewLineup(playerIds);

    var candidates = playerIds.length === 4 ? fourPlayerSplits(playerIds) : fivePlayerLineups(playerIds);
    var counts = sessionPairingCounts(sessionId);
    var scored = candidates.map(function (c) { return { lineup: c, score: scoreLineup(c, counts) }; });
    var minScore = Math.min.apply(null, scored.map(function (s) { return s.score; }));
    var minSet = scored.filter(function (s) { return s.score === minScore; }).map(function (s) { return s.lineup; });
    var chosen = minSet[Math.floor(Math.random() * minSet.length)];

    // Randomize presentation within the chosen lineup -- which side is
    // "Team A"/"Team B", or the pool's sit-out order -- since that
    // doesn't affect which pairings occur, only their order/labeling.
    if (chosen.mode === "fixed") {
      var teams = Math.random() < 0.5 ? [chosen.teams[0], chosen.teams[1]] : [chosen.teams[1], chosen.teams[0]];
      return { mode: "fixed", teams: teams };
    }
    return { mode: "rotation", fixedTeam: chosen.fixedTeam, pool: shuffle(chosen.pool) };
  }

  // ---- Statistics -------------------------------------------------

  // Which side of a game a player was on: 'A', 'B', or null if they
  // weren't in it. Fixed-mode: whichever team array contains them.
  // Rotation-mode: 'A' if they're the fixed team, 'B' if they're in the
  // pool (pool members are only ever on the non-fixed side, whichever
  // round they're actually playing).
  function playerSide(game, playerId) {
    if (game.mode === "rotation") {
      if (game.fixedTeam.indexOf(playerId) !== -1) return "A";
      if (game.pool.indexOf(playerId) !== -1) return "B";
      return null;
    }
    if (game.teams[0].indexOf(playerId) !== -1) return "A";
    if (game.teams[1].indexOf(playerId) !== -1) return "B";
    return null;
  }

  // Per-player, per-session stats (requirements doc section 5). Tichu
  // calls and double wins are tracked at the team level by this app (it
  // doesn't record which of the two teammates made the call), so
  // they're attributed to both players on that side for that round.
  function computePlayerSessionStats(playerId, sessionId) {
    var games = getSessionGames(sessionId).filter(function (g) { return g.winner; });
    var stats = {
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0, winPct: 0,
      totalPoints: 0, avgPointsPerGame: 0, bestGameScore: null,
      tichuWon: 0, tichuLost: 0, grandTichuWon: 0, grandTichuLost: 0,
      doubleWins: 0,
    };
    games.forEach(function (g) {
      var side = playerSide(g, playerId);
      if (!side) return;
      stats.gamesPlayed++;
      if (g.winner === side) stats.gamesWon++;
      else if (g.winner !== "tie") stats.gamesLost++;

      var pts = g.finalScores ? g.finalScores[side === "A" ? "teamA" : "teamB"] : null;
      if (typeof pts === "number") {
        stats.totalPoints += pts;
        if (stats.bestGameScore === null || pts > stats.bestGameScore) stats.bestGameScore = pts;
      }

      (g.rounds || []).forEach(function (r) {
        var roundSide = side;
        if (g.mode === "rotation" && g.pool.indexOf(playerId) !== -1) {
          if (r.sittingOutPlayerId === playerId) return; // sat out this round
          roundSide = "B";
        }
        var mod = roundSide === "A" ? r.teamATichuMod : r.teamBTichuMod;
        var dw = roundSide === "A" ? r.teamADoubleWin : r.teamBDoubleWin;
        if (mod === 200) stats.grandTichuWon++;
        else if (mod === 100) stats.tichuWon++;
        else if (mod === -200) stats.grandTichuLost++;
        else if (mod === -100) stats.tichuLost++;
        if (dw) stats.doubleWins++;
      });
    });
    stats.winPct = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 1000) / 10 : 0;
    stats.avgPointsPerGame = stats.gamesPlayed ? Math.round(stats.totalPoints / stats.gamesPlayed) : 0;
    return stats;
  }

  // Per-session stats: games played, duration (excluding paused time),
  // and a leaderboard of that session's players ranked by total points.
  function computeSessionStats(sessionId) {
    var session = getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    var games = getSessionGames(sessionId).filter(function (g) { return g.winner; });

    var leaderboard = session.playerIds.map(function (pid) {
      var s = computePlayerSessionStats(pid, sessionId);
      var p = getPlayer(pid);
      return {
        playerId: pid,
        playerName: p ? p.name : "(removed player)",
        gamesPlayed: s.gamesPlayed,
        gamesWon: s.gamesWon,
        winPct: s.winPct,
        totalPoints: s.totalPoints,
      };
    }).sort(function (a, b) { return b.totalPoints - a.totalPoints; });

    var pausedMs = 0;
    (session.pauseLog || []).forEach(function (entry) {
      var end = entry.resumedAt || session.endedAt || Date.now();
      pausedMs += Math.max(0, end - entry.pausedAt);
    });
    var endPoint = session.endedAt || Date.now();
    var durationMs = Math.max(0, endPoint - session.startedAt - pausedMs);

    return { gamesPlayed: games.length, durationMs: durationMs, leaderboard: leaderboard };
  }

  // All-time stats for a player, aggregated across every session
  // they've been part of (regardless of that session's current status).
  function computePlayerAllTimeStats(playerId) {
    var sessions = getSessions().filter(function (s) { return s.playerIds.indexOf(playerId) !== -1; });
    var totals = {
      sessionsAttended: sessions.length,
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0, winPct: 0,
      totalPoints: 0, avgPointsPerGame: 0, bestGameScore: null,
      tichuWon: 0, tichuLost: 0, grandTichuWon: 0, grandTichuLost: 0,
      doubleWins: 0,
    };
    sessions.forEach(function (s) {
      var stats = computePlayerSessionStats(playerId, s.id);
      totals.gamesPlayed += stats.gamesPlayed;
      totals.gamesWon += stats.gamesWon;
      totals.gamesLost += stats.gamesLost;
      totals.totalPoints += stats.totalPoints;
      totals.tichuWon += stats.tichuWon;
      totals.tichuLost += stats.tichuLost;
      totals.grandTichuWon += stats.grandTichuWon;
      totals.grandTichuLost += stats.grandTichuLost;
      totals.doubleWins += stats.doubleWins;
      if (stats.bestGameScore !== null && (totals.bestGameScore === null || stats.bestGameScore > totals.bestGameScore)) {
        totals.bestGameScore = stats.bestGameScore;
      }
    });
    totals.winPct = totals.gamesPlayed ? Math.round((totals.gamesWon / totals.gamesPlayed) * 1000) / 10 : 0;
    totals.avgPointsPerGame = totals.gamesPlayed ? Math.round(totals.totalPoints / totals.gamesPlayed) : 0;
    return totals;
  }

  function pauseSession(id) {
    var session = getSession(id);
    if (!session) throw new Error("Session not found.");
    if (session.status !== "active") throw new Error("Only an active session can be paused.");
    session.status = "paused";
    if (!session.pauseLog) session.pauseLog = [];
    session.pauseLog.push({ pausedAt: Date.now(), resumedAt: null });
    saveSession(session);
    return session;
  }

  function resumeSession(id) {
    var session = getSession(id);
    if (!session) throw new Error("Session not found.");
    if (session.status !== "paused") throw new Error("Only a paused session can be resumed.");
    session.status = "active";
    var openEntry = (session.pauseLog || []).filter(function (e) { return e.resumedAt === null; })[0];
    if (openEntry) openEntry.resumedAt = Date.now();
    saveSession(session);
    return session;
  }

  function endSession(id) {
    var session = getSession(id);
    if (!session) throw new Error("Session not found.");
    if (getCurrentGame()) {
      throw new Error("Finish or discard the in-progress game before ending the session.");
    }
    session.status = "ended";
    session.endedAt = Date.now();
    // Close out any still-open pause interval (e.g. the session was
    // ended directly from Paused rather than resumed first).
    (session.pauseLog || []).forEach(function (e) {
      if (e.resumedAt === null) e.resumedAt = session.endedAt;
    });
    saveSession(session);
    return session;
  }

  // ---- Games ------------------------------------------------------

  function getGames() {
    return readJSON(KEYS.GAMES);
  }

  function getSessionGames(sessionId) {
    return getGames().filter(function (g) { return g.sessionId === sessionId; });
  }

  function getGame(id) {
    return getGames().filter(function (g) { return g.id === id; })[0] || null;
  }

  function saveGame(game) {
    var games = getGames();
    var idx = games.findIndex(function (g) { return g.id === game.id; });
    if (idx === -1) games.push(game);
    else games[idx] = game;
    writeJSON(KEYS.GAMES, games);
  }

  function getCurrentGameId() {
    return localStorage.getItem(KEYS.CURRENT_GAME_ID) || null;
  }
  function setCurrentGameId(id) {
    if (id) localStorage.setItem(KEYS.CURRENT_GAME_ID, id);
    else localStorage.removeItem(KEYS.CURRENT_GAME_ID);
  }

  // Returns the in-progress game (no winner yet), or null. Also
  // self-heals a stale pointer (e.g. game already finished elsewhere).
  function getCurrentGame() {
    var id = getCurrentGameId();
    if (!id) return null;
    var game = getGame(id);
    if (!game || game.winner) {
      setCurrentGameId(null);
      return null;
    }
    return game;
  }

  function startNewGameInSession(sessionId, lineup) {
    var session = getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    if (session.status !== "active") throw new Error("Resume the session before starting a new game.");
    if (getCurrentGame()) throw new Error("A game is already in progress for this session.");
    // Falls back to a plain random lineup if the UI doesn't pass one --
    // callers that want repeat-pairing avoidance should generate the
    // lineup with previewLineupForSession() and pass it in explicitly.
    if (lineup && !isValidLineupFor(session.playerIds, lineup)) {
      throw new Error("That lineup doesn't match this session's players.");
    }
    var finalLineup = lineup || previewLineup(session.playerIds);
    var game = {
      id: makeId("g"),
      sessionId: sessionId,
      mode: finalLineup.mode,
      winner: null,
      startedAt: Date.now(),
      endedAt: null,
      rounds: [],
    };
    if (finalLineup.mode === "fixed") {
      game.teams = finalLineup.teams;
    } else {
      game.fixedTeam = finalLineup.fixedTeam;
      game.pool = finalLineup.pool;
    }
    saveGame(game);
    setCurrentGameId(game.id);
    return game;
  }

  function recordRound(gameId, round) {
    var game = getGame(gameId);
    if (!game) return;
    game.rounds.push(round);
    saveGame(game);
  }

  function finishGame(gameId, winner, finalScores) {
    var game = getGame(gameId);
    if (!game) throw new Error("Game not found.");
    game.winner = winner || "tie";
    game.finalScores = finalScores || null;
    game.endedAt = Date.now();
    saveGame(game);
    if (getCurrentGameId() === gameId) setCurrentGameId(null);
    return game;
  }

  // Discards an in-progress game entirely (e.g. started by mistake, or
  // the user wants to end the session without finishing it) so it never
  // lands in session history as an orphaned, winner-less game.
  function discardCurrentGame() {
    var id = getCurrentGameId();
    if (!id) return;
    var games = getGames().filter(function (g) { return g.id !== id; });
    writeJSON(KEYS.GAMES, games);
    setCurrentGameId(null);
  }

  global.TichuPlayers = {
    KEYS: KEYS,
    // players
    getPlayers: getPlayers,
    getPlayer: getPlayer,
    addPlayer: addPlayer,
    renamePlayer: renamePlayer,
    archivePlayer: archivePlayer,
    unarchivePlayer: unarchivePlayer,
    teamNameString: teamNameString,
    previewLineup: previewLineup,
    previewLineupForSession: previewLineupForSession,
    getRoundLineup: getRoundLineup,
    computePlayerSessionStats: computePlayerSessionStats,
    computeSessionStats: computeSessionStats,
    computePlayerAllTimeStats: computePlayerAllTimeStats,
    // sessions
    getSessions: getSessions,
    getSession: getSession,
    getActiveOrPausedSession: getActiveOrPausedSession,
    getSessionHistory: getSessionHistory,
    startSession: startSession,
    pauseSession: pauseSession,
    resumeSession: resumeSession,
    endSession: endSession,
    // games
    getSessionGames: getSessionGames,
    getGame: getGame,
    getCurrentGame: getCurrentGame,
    startNewGameInSession: startNewGameInSession,
    recordRound: recordRound,
    finishGame: finishGame,
    discardCurrentGame: discardCurrentGame,
  };
})(window);
