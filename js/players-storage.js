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
 * Phase 5 adds: the dealer of each round (shown on the scoreboard and in
 * the round history), chosen fairly across the session.
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

  // Rotate array so element at startIndex becomes first
  function rotateArray(arr, startIndex) {
    if (!Array.isArray(arr) || arr.length === 0) return arr.slice();
    var n = arr.length;
    var s = ((startIndex % n) + n) % n;
    return arr.slice(s).concat(arr.slice(0, s));
  }

  // ---- Players -----------------------------------------------------

  function currentUid() {
    return localStorage.getItem("tichuCloudUser") || null;
  }

  // Records without ownerUid were created on this device by the current user.
  function isOwn(record) {
    return !record || !record.ownerUid || record.ownerUid === currentUid();
  }

  function getPlayers(opts) {
    var players = readJSON(KEYS.PLAYERS);
    if (opts && opts.activeOnly) {
      players = players.filter(function (p) { return p.active; });
    }
    if (opts && opts.ownOnly) {
      players = players.filter(isOwn);
    }
    return players;
  }

  function getPlayer(id) {
    return getPlayers().filter(function (p) { return p.id === id; })[0] || null;
  }

  // Own players first, then names shared by hosts in session/game docs.
  function resolveName(id, fallback) {
    var p = getPlayer(id);
    if (p) return p.name;
    try {
      var shared = JSON.parse(localStorage.getItem("tichuSharedNames") || "{}");
      if (shared[id]) return shared[id];
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function addPlayer(name) {
    name = (name || "").trim();
    if (!name) throw new Error("Player name can't be empty.");
    var players = readJSON(KEYS.PLAYERS);
    var player = { id: makeId("p"), name: name, active: true, createdAt: Date.now(), statsResetAt: null };
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

  function deletePlayer(id) {
    var players = readJSON(KEYS.PLAYERS);
    var player = players.filter(function (p) { return p.id === id; })[0];
    if (!player) throw new Error("Player not found.");
    if (!isOwn(player)) throw new Error("Only the host can delete " + player.name + ".");
    if (player.active) throw new Error("Archive " + player.name + " before deleting.");
    var inOpenSession = readJSON(KEYS.SESSIONS).some(function (s) {
      return (s.status === "active" || s.status === "paused") && s.playerIds.indexOf(id) !== -1;
    });
    if (inOpenSession) throw new Error("End the active session before deleting " + player.name + ".");
    writeJSON(KEYS.PLAYERS, players.filter(function (p) { return p.id !== id; }));
  }

  function teamNameString(playerIds) {
    return playerIds
      .map(function (id) { return resolveName(id, "Deleted player"); })
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
    return getSessions().filter(function (s) { return isOwn(s) && (s.status === "active" || s.status === "paused"); })[0] || null;
  }

  // View mode: a signed-in user with no session of their own follows another
  // host's active/paused session. A user is either a host or a viewer.
  function getLiveSharedSession() {
    if (!currentUid() || getActiveOrPausedSession()) return null;
    return getSessions().filter(function (s) { return !isOwn(s) && (s.status === "active" || s.status === "paused"); })[0] || null;
  }

  function getLiveSharedGame(session) {
    if (!session) return null;
    var games = getGames().filter(function (g) { return g.sessionId === session.id && (!g.winner || g.pendingNextGame); });
    return games[games.length - 1] || null;
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
    if ((playerIds.length < 4 || playerIds.length > 6) || new Set(playerIds).size !== playerIds.length) {
      throw new Error("Sessions need 4, 5 or 6 distinct players.");
    }
    var session = {
      id: makeId("s"),
      status: "active",
      startedAt: Date.now(),
      endedAt: null,
      playerIds: playerIds,
      // Index used to decide which pool member sits out first in the
      // next rotation-mode game. This advances each new game to keep
      // sit-out duties balanced across the session.
      nextPoolStart: 0,
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
  // 6 players -> {mode: 'threeTeams', teams: [[a,b],[c,d],[e,f]]}.
  function previewLineup(playerIds) {
    var shuffled = shuffle(playerIds);
    if (playerIds.length === 4) {
      return { mode: "fixed", teams: [shuffled.slice(0, 2), shuffled.slice(2, 4)] };
    }
    if (playerIds.length === 5) {
      return { mode: "rotation", fixedTeam: shuffled.slice(0, 2), pool: shuffled.slice(2, 5) };
    }
    if (playerIds.length === 6) {
      return { mode: "threeTeams", teams: [shuffled.slice(0, 2), shuffled.slice(2, 4), shuffled.slice(4, 6)] };
    }
    throw new Error("Sessions support 4, 5 or 6 players.");
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
    if (lineup.mode === "threeTeams") {
      return playerIds.length === 6 && Array.isArray(lineup.teams) &&
        lineup.teams.length === 3 && lineup.teams.every(function (team) {
          return Array.isArray(team) && team.length === 2;
        }) && sameIdSet(playerIds, [].concat.apply([], lineup.teams));
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
    if (game.mode === "threeTeams") {
      var restIndex = (game.firstRestingTeam + roundNumber - 1) % 3;
      var activeIndices = [0, 1, 2].filter(function (i) { return i !== restIndex; });
      return {
        teamA: game.teams[activeIndices[0]], teamB: game.teams[activeIndices[1]],
        activeIndices: activeIndices, restingTeam: restIndex,
        sittingOut: game.teams[restIndex]
      };
    }
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

  // ---- Dealer of each round ---------------------------------------------
  // Session games show who deals the hand being scored. The dealer for the
  // round currently in play is stored on the game record as
  // `nextDealerPlayerId` -- picked when the game starts, then advanced by
  // recordRound() every time a round is recorded -- so it survives page
  // reloads, and Undo can simply restore it from the popped round.
  //
  // Selection rules, in priority order:
  //  1. A player who sits out that round never deals (candidates are only
  //     the round's active players, from getRoundLineup).
  //  2. The dealing team alternates every round -- and across games, so
  //     each new game starts with the opposite team of the last deal.
  //  3. Deal counts stay as even as possible across the session: among the
  //     eligible players, whoever has dealt the fewest times wins, with
  //     ties going to whoever dealt longest ago (or never dealt yet),
  //     which is what keeps the dealer rotating.

  // Every recorded round of a session in chronological order (games are
  // stored in creation order, rounds within them in playback order).
  function sessionRoundsInOrder(sessionId) {
    var entries = [];
    getSessionGames(sessionId).forEach(function (g) {
      (g.rounds || []).forEach(function (r) {
        entries.push({ game: g, round: r });
      });
    });
    return entries;
  }

  function sessionDealCounts(sessionId) {
    var session = getSession(sessionId);
    var counts = {};
    session.playerIds.forEach(function (pid) { counts[pid] = 0; });
    sessionRoundsInOrder(sessionId).forEach(function (entry) {
      var dealerId = entry.round.dealerPlayerId;
      if (dealerId && counts[dealerId] !== undefined) counts[dealerId]++;
    });
    return counts;
  }

  // Ordered list of dealer ids across the whole session, used for the
  // "longest since last deal" tie-break above.
  function sessionDealerHistory(sessionId) {
    var history = [];
    sessionRoundsInOrder(sessionId).forEach(function (entry) {
      if (entry.round.dealerPlayerId) history.push(entry.round.dealerPlayerId);
    });
    return history;
  }

  // The dealer of the most recently recorded round in the session, or null
  // (used as the "previous dealer" when starting a brand-new game).
  function lastRecordedDealer(sessionId) {
    var history = sessionDealerHistory(sessionId);
    return history.length ? history[history.length - 1] : null;
  }

  // Picks who deals the upcoming round. `lineup` is the round's active
  // players (see getRoundLineup), so anyone sitting out is already out of
  // contention. `prevDealerId` is the dealer of the round just completed
  // (or, for a fresh game, the previous game's last dealer).
  function pickDealerForRound(game, lineup, prevDealerId, counts, history) {
    var active = lineup.teamA.concat(lineup.teamB);
    var opposite = null;
    if (game.mode === "threeTeams" && prevDealerId) {
      var previousTeam = playerSide(game, prevDealerId);
      var otherTeamPlayers = active.filter(function (id) { return playerSide(game, id) !== previousTeam; });
      if (otherTeamPlayers.length) active = otherTeamPlayers;
    } else if (prevDealerId && playerSide(game, prevDealerId)) {
      opposite = playerSide(game, prevDealerId) === "A" ? "B" : "A";
    }
    var candidates = opposite
      ? active.filter(function (id) { return playerSide(game, id) === opposite; })
      : active.slice();
    if (!candidates.length) candidates = active.slice();

    candidates.sort(function (a, b) {
      var diff = (counts[a] || 0) - (counts[b] || 0);
      if (diff !== 0) return diff;
      var recentA = history.lastIndexOf(a);
      var recentB = history.lastIndexOf(b);
      if (recentA !== recentB) return recentA - recentB;
      return a < b ? -1 : 1;
    });
    return candidates[0];
  }

  // The dealer currently assigned to the round in play (stored on the game
  // record), or null if not known (e.g. a game started before Phase 5).
  function getCurrentRoundDealer(game) {
    return game ? (game.nextDealerPlayerId || null) : null;
  }

  // The dealer recorded for a specific round of a (possibly finished) game,
  // for history views; null when not known.
  function getRoundDealerPlayerId(gameId, roundNumber) {
    var game = getGame(gameId);
    if (!game || !game.rounds) return null;
    var round = game.rounds[roundNumber - 1];
    return round ? (round.dealerPlayerId || null) : null;
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

  function sixPlayerLineups(playerIds) {
    var anchor = playerIds[0];
    var lineups = [];
    playerIds.slice(1).forEach(function (partner) {
      var remaining = playerIds.filter(function (id) { return id !== anchor && id !== partner; });
      fourPlayerSplits(remaining).forEach(function (split) {
        lineups.push({ mode: "threeTeams", teams: [[anchor, partner]].concat(split.teams) });
      });
    });
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
      } else if (g.mode === "threeTeams") {
        g.teams.forEach(function (team) { bump(team[0], team[1]); });
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
    if (lineup.mode === "threeTeams") {
      return lineup.teams.reduce(function (sum, team) { return sum + get(team[0], team[1]); }, 0);
    }
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

    if (playerIds.length === 6) {
      var sixCounts = sessionPairingCounts(sessionId);
      var sixCandidates = sixPlayerLineups(playerIds);
      var best = Math.min.apply(null, sixCandidates.map(function (lineup) { return scoreLineup(lineup, sixCounts); }));
      var bestLineups = sixCandidates.filter(function (lineup) { return scoreLineup(lineup, sixCounts) === best; });
      return { mode: "threeTeams", teams: shuffle(bestLineups[Math.floor(Math.random() * bestLineups.length)].teams) };
    }

    var candidates = playerIds.length === 4 ? fourPlayerSplits(playerIds) : fivePlayerLineups(playerIds);
    var counts = sessionPairingCounts(sessionId);
    var scored = candidates.map(function (c) { return { lineup: c, score: scoreLineup(c, counts) }; });
    var minScore = Math.min.apply(null, scored.map(function (s) { return s.score; }));

    // For rotation mode, fairness is more important than a tiny repeat-pairing
    // improvement: pick a lineup that keeps the 3-player pool distribution as
    // even as possible across the session, then use repeat-pairing score as the
    // final tiebreaker.
    function poolExposureCounts(sessionId) {
      var counts = {};
      getSessionGames(sessionId).forEach(function (g) {
        if (!g.winner) return;
        if (g.mode === 'rotation' && g.pool) {
          g.pool.forEach(function (pid) { counts[pid] = (counts[pid] || 0) + 1; });
        }
      });
      return counts;
    }
    function sitOutFirstCounts(sessionId) {
      var counts = {};
      getSessionGames(sessionId).forEach(function (g) {
        if (!g.winner) return;
        if (g.mode === 'rotation' && g.pool && g.pool.length === 3) {
          var firstSitter = g.pool[0];
          counts[firstSitter] = (counts[firstSitter] || 0) + 1;
        }
      });
      return counts;
    }

    var chosen;
    if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      var poolCounts = poolExposureCounts(sessionId);
      var firstSitterCounts = sitOutFirstCounts(sessionId);
      var nextStart = (session.nextPoolStart || 0) % 3;
      var scoredWithFairness = candidates.map(function (ln) {
        var repeatScore = scoreLineup(ln, counts);
        var poolScore = 0;
        var countsAfter = {};
        session.playerIds.forEach(function (pid) {
          countsAfter[pid] = (poolCounts[pid] || 0);
        });
        var firstSitterScore = 0;
        if (ln.mode === 'rotation' && ln.pool) {
          var rotatedPool = rotateArray(ln.pool, nextStart);
          var sitterId = rotatedPool[0];
          firstSitterScore = firstSitterCounts[sitterId] || 0;
          ln.pool.forEach(function (pid) {
            countsAfter[pid] = (countsAfter[pid] || 0) + 1;
            poolScore += (poolCounts[pid] || 0);
          });
        }
        var vals = session.playerIds.map(function (pid) { return countsAfter[pid] || 0; });
        var average = vals.reduce(function (sum, value) { return sum + value; }, 0) / vals.length;
        var variance = vals.reduce(function (sum, value) {
          var delta = value - average;
          return sum + (delta * delta);
        }, 0);
        return {
          lineup: ln,
          repeatScore: repeatScore,
          poolScore: poolScore,
          variance: variance,
          firstSitterScore: firstSitterScore
        };
      });
      var minFirst = Math.min.apply(null, scoredWithFairness.map(function (s) { return s.firstSitterScore; }));
      var firstSet = scoredWithFairness.filter(function (s) { return s.firstSitterScore === minFirst; });
      var minVariance = Math.min.apply(null, firstSet.map(function (s) { return s.variance; }));
      var varianceSet = firstSet.filter(function (s) { return s.variance === minVariance; });
      var minRepeat = Math.min.apply(null, varianceSet.map(function (s) { return s.repeatScore; }));
      var repeatSet = varianceSet.filter(function (s) { return s.repeatScore === minRepeat; });
      chosen = repeatSet[Math.floor(Math.random() * repeatSet.length)].lineup;
    }

    // Randomize presentation within the chosen lineup -- which side is
    // "Team A"/"Team B", or the pool's sit-out order -- since that
    // doesn't affect which pairings occur, only their order/labeling.
    if (chosen.mode === "fixed") {
      var teams = Math.random() < 0.5 ? [chosen.teams[0], chosen.teams[1]] : [chosen.teams[1], chosen.teams[0]];
      return { mode: "fixed", teams: teams };
    }

    // For rotation mode, shuffle the pool for presentation but rotate
    // the pool so the first sitting-out player matches the session's
    // nextPoolStart index. This keeps the preview aligned with which
    // pool member will sit out in round 1 when the game starts.
    var p = shuffle(chosen.pool);
    var startIdx = (session && typeof session.nextPoolStart === 'number') ? (session.nextPoolStart % 3) : 0;
    var rotatedPool = rotateArray(p, startIdx);
    return { mode: "rotation", fixedTeam: chosen.fixedTeam, pool: rotatedPool };
  }

  // ---- Statistics -------------------------------------------------

  // Which side of a game a player was on: 'A', 'B', or null if they
  // weren't in it. Fixed-mode: whichever team array contains them.
  // Rotation-mode: 'A' if they're the fixed team, 'B' if they're in the
  // pool (pool members are only ever on the non-fixed side, whichever
  // round they're actually playing).
  function playerSide(game, playerId) {
    if (game.mode === "threeTeams") {
      var index = game.teams.findIndex(function (team) { return team.indexOf(playerId) !== -1; });
      return index === -1 ? null : ["A", "B", "C"][index];
    }
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
    var player = getPlayer(playerId);
    var resetAt = player && player.statsResetAt ? player.statsResetAt : 0;
    var games = getSessionGames(sessionId).filter(function (g) {
      return g.winner && (!g.startedAt || g.startedAt > resetAt);
    });
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

      var pts = g.finalScores ? g.finalScores["team" + side] : null;
      if (typeof pts === "number") {
        stats.totalPoints += pts;
        if (stats.bestGameScore === null || pts > stats.bestGameScore) stats.bestGameScore = pts;
      }

      (g.rounds || []).forEach(function (r) {
        if (g.mode === "threeTeams") {
          var teamIndex = ["A", "B", "C"].indexOf(side);
          if (r.activeTeams.indexOf(teamIndex) === -1) return;
          var sixMod = r.tichuMods[teamIndex];
          if (sixMod === 200) stats.grandTichuWon++;
          else if (sixMod === 100) stats.tichuWon++;
          else if (sixMod === -200) stats.grandTichuLost++;
          else if (sixMod === -100) stats.tichuLost++;
          if (r.doubleWins[teamIndex]) stats.doubleWins++;
          return;
        }
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
      return {
        playerId: pid,
        playerName: resolveName(pid, "(removed player)"),
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
    var player = getPlayer(playerId);
    var resetAt = player && player.statsResetAt ? player.statsResetAt : 0;
    var sessions = getSessions().filter(function (s) {
      if (s.playerIds.indexOf(playerId) === -1) return false;
      return getSessionGames(s.id).some(function (g) {
        return g.winner && (!g.startedAt || g.startedAt > resetAt);
      });
    });
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

  function resetPlayerStatistics(playerId) {
    var players = readJSON(KEYS.PLAYERS);
    var player = players.filter(function (p) { return p.id === playerId; })[0];
    if (!player) throw new Error("Player not found.");
    player.statsResetAt = Date.now();
    writeJSON(KEYS.PLAYERS, players);
    return player;
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
    var currentGame = getCurrentGame();
    if (currentGame && currentGame.sessionId === id) {
      if (currentGame.winner) setCurrentGameId(null);
      else discardCurrentGame();
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

  // A finished three-team game remains current until the next game starts,
  // so its result can be reviewed or undone even after a reload.
  function getCurrentGame() {
    var id = getCurrentGameId();
    if (!id) return null;
    var game = getGame(id);
    if (!game || (game.winner && !game.pendingNextGame)) {
      setCurrentGameId(null);
      return null;
    }
    return game;
  }

  function startNewGameInSession(sessionId, lineup) {
    var session = getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    if (session.status === "paused") {
      session.status = "active";
      saveSession(session);
    }
    if (session.status !== "active") throw new Error("This session cannot start a new game.");
    var current = getCurrentGame();
    if (current && !current.pendingNextGame) throw new Error("A game is already in progress for this session.");
    // Falls back to a lineup selected by previewLineupForSession if the
    // UI doesn't pass one. That preview already avoids repeat pairings
    // where possible.
    if (lineup && !isValidLineupFor(session.playerIds, lineup)) {
      throw new Error("That lineup doesn't match this session's players.");
    }
    if (current) setCurrentGameId(null);

    var finalLineup = lineup || previewLineupForSession(sessionId);

    // For rotation mode, ensure the pool order is rotated so the first
    // sitting-out player corresponds to session.nextPoolStart. Advance
    // the pointer so subsequent games start at the next pool member.
    if (finalLineup.mode === "rotation") {
      var nextStart = (session.nextPoolStart || 0) % 3;
      var p = finalLineup.pool.slice();
      finalLineup.pool = rotateArray(p, nextStart);
      session.nextPoolStart = ((session.nextPoolStart || 0) + 1) % 3;
      saveSession(session);
    }

    var game = {
      id: makeId("g"),
      sessionId: sessionId,
      mode: finalLineup.mode,
      winner: null,
      startedAt: Date.now(),
      endedAt: null,
      rounds: [],
    };
    if (finalLineup.mode === "fixed" || finalLineup.mode === "threeTeams") {
      game.teams = finalLineup.teams;
    } else {
      game.fixedTeam = finalLineup.fixedTeam;
      game.pool = finalLineup.pool;
    }
    if (game.mode === "threeTeams") {
      var rests = {};
      session.playerIds.forEach(function (id) { rests[id] = 0; });
      sessionRoundsInOrder(sessionId).forEach(function (entry) {
        if (entry.game.mode !== "threeTeams") return;
        var resting = entry.game.teams.filter(function (_, i) { return entry.round.activeTeams.indexOf(i) === -1; })[0];
        resting.forEach(function (id) { rests[id]++; });
      });
      var restScores = game.teams.map(function (team) {
        return team.reduce(function (sum, id) { return sum + rests[id]; }, 0);
      });
      var least = Math.min.apply(null, restScores);
      var eligible = [0, 1, 2].filter(function (i) { return restScores[i] === least; });
      game.firstRestingTeam = eligible[Math.floor(Math.random() * eligible.length)];
    }
    // Pick the dealer for round 1 so the scoreboard can show it straight
    // away. The starting team flips relative to the previous game's last
    // dealer, keeping team alternation continuous across the session.
    game.nextDealerPlayerId = pickDealerForRound(
      game,
      getRoundLineup(game, 1),
      lastRecordedDealer(sessionId),
      sessionDealCounts(sessionId),
      sessionDealerHistory(sessionId)
    );
    saveGame(game);
    setCurrentGameId(game.id);
    return game;
  }

  function recordRound(gameId, round) {
    var game = getGame(gameId);
    if (!game) return;
    game.rounds.push(round);
    // The round we just recorded is history now; if it names its dealer,
    // schedule the next round's dealer too (active player, alternating
    // team, balanced session counts).
    if (round.dealerPlayerId && getSession(game.sessionId)) {
      var nextRoundNumber = game.rounds.length + 1;
      var dealCounts = sessionDealCounts(game.sessionId);
      var dealerHistory = sessionDealerHistory(game.sessionId);
      if (game.mode === "threeTeams") {
        dealCounts[round.dealerPlayerId] = (dealCounts[round.dealerPlayerId] || 0) + 1;
        dealerHistory.push(round.dealerPlayerId);
      }
      game.nextDealerPlayerId = pickDealerForRound(
        game,
        getRoundLineup(game, nextRoundNumber),
        round.dealerPlayerId,
        dealCounts,
        dealerHistory
      );
    }
    saveGame(game);
  }

  // Removes the most recently recorded round from a game's record.
  // Mirrors recordRound for the scoreboard's Undo action, letting an undo
  // in session mode also unwind the session's stored history, chart and
  // statistics.
  function unrecordRound(gameId) {
    var game = getGame(gameId);
    if (!game) return;
    var popped = game.rounds.pop();
    // Undo also rewinds the dealer pointer: the round we're back on is the
    // one that was just removed, so its dealer must be shown again.
    if (popped && popped.dealerPlayerId) {
      game.nextDealerPlayerId = popped.dealerPlayerId;
    }
    saveGame(game);
  }

  function restoreGameRounds(gameId, rounds, nextDealerPlayerId) {
    var game = getGame(gameId);
    if (!game || game.mode !== "threeTeams" || game.winner) throw new Error("Game cannot be restored.");
    game.rounds = rounds;
    game.nextDealerPlayerId = nextDealerPlayerId;
    saveGame(game);
  }

  function reopenGame(gameId) {
    var game = getGame(gameId);
    if (!game || game.mode !== "threeTeams" || !game.pendingNextGame) throw new Error("Game cannot be reopened.");
    game.winner = null;
    game.finalScores = null;
    game.endedAt = null;
    game.pendingNextGame = false;
    saveGame(game);
    return game;
  }

  function finishGame(gameId, winner, finalScores) {
    var game = getGame(gameId);
    if (!game) throw new Error("Game not found.");
    game.winner = winner || "tie";
    game.finalScores = finalScores || null;
    game.endedAt = Date.now();
    if (game.mode === "threeTeams") game.pendingNextGame = true;
    saveGame(game);
    if (!game.pendingNextGame && getCurrentGameId() === gameId) setCurrentGameId(null);
    return game;
  }

  function finishThreeTeamGameIfWon(game, threshold) {
    if (!game || game.mode !== "threeTeams" || game.winner || !game.rounds.length) return game;
    var scores = game.rounds[game.rounds.length - 1].scores;
    var max = Math.max.apply(null, scores);
    var leaders = [0, 1, 2].filter(function (i) { return scores[i] === max; });
    if (max < threshold || leaders.length !== 1) return game;
    return finishGame(game.id, ["A", "B", "C"][leaders[0]], {
      teamA: scores[0], teamB: scores[1], teamC: scores[2]
    });
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

  function deleteGame(id) {
    var game = getGame(id);
    if (!game) throw new Error("Game not found.");

    writeJSON(KEYS.GAMES, getGames().filter(function (g) { return g.id !== id; }));
    if (getCurrentGameId() === id) {
      setCurrentGameId(null);
      if (global.TichuStorage) global.TichuStorage.resetGame();
    }
    return game;
  }

  function deleteSession(id) {
    var session = getSession(id);
    if (!session) throw new Error("Session not found.");

    var deletedGameIds = getSessionGames(id).map(function (g) { return g.id; });
    writeJSON(KEYS.GAMES, getGames().filter(function (g) {
      return g.sessionId !== id;
    }));
    writeJSON(KEYS.SESSIONS, getSessions().filter(function (s) { return s.id !== id; }));
    if (deletedGameIds.indexOf(getCurrentGameId()) !== -1) {
      setCurrentGameId(null);
      if (global.TichuStorage) global.TichuStorage.resetGame();
    }
    return session;
  }

  function resetStatistics() {
    // Clear accumulated history while keeping the player roster itself.
    writeJSON(KEYS.SESSIONS, []);
    writeJSON(KEYS.GAMES, []);
    setCurrentGameId(null);

    // Also clear the active quick-game snapshot so a fresh board isn't
    // carrying hidden leftover totals from test data. Reuse TichuStorage's
    // resetGame() so the localStorage keys stay defined in exactly one place.
    if (global.TichuStorage) global.TichuStorage.resetGame();
  }

  global.TichuPlayers = {
    KEYS: KEYS,
    // players
    getPlayers: getPlayers,
    isOwn: isOwn,
    currentUid: currentUid,
    getPlayer: getPlayer,
    resolveName: resolveName,
    getLiveSharedSession: getLiveSharedSession,
    getLiveSharedGame: getLiveSharedGame,
    addPlayer: addPlayer,
    renamePlayer: renamePlayer,
    archivePlayer: archivePlayer,
    unarchivePlayer: unarchivePlayer,
    deletePlayer: deletePlayer,
    teamNameString: teamNameString,
    previewLineup: previewLineup,
    previewLineupForSession: previewLineupForSession,
    getRoundLineup: getRoundLineup,
    getCurrentRoundDealer: getCurrentRoundDealer,
    getRoundDealerPlayerId: getRoundDealerPlayerId,
    computePlayerSessionStats: computePlayerSessionStats,
    computeSessionStats: computeSessionStats,
    computePlayerAllTimeStats: computePlayerAllTimeStats,
    resetPlayerStatistics: resetPlayerStatistics,
    // sessions
    getSessions: getSessions,
    getSession: getSession,
    getActiveOrPausedSession: getActiveOrPausedSession,
    getSessionHistory: getSessionHistory,
    startSession: startSession,
    pauseSession: pauseSession,
    resumeSession: resumeSession,
    endSession: endSession,
    resetStatistics: resetStatistics,
    // games
    getSessionGames: getSessionGames,
    getGame: getGame,
    getCurrentGame: getCurrentGame,
    startNewGameInSession: startNewGameInSession,
    recordRound: recordRound,
    unrecordRound: unrecordRound,
    restoreGameRounds: restoreGameRounds,
    reopenGame: reopenGame,
    finishGame: finishGame,
    finishThreeTeamGameIfWon: finishThreeTeamGameIfWon,
    discardCurrentGame: discardCurrentGame,
    deleteGame: deleteGame,
    deleteSession: deleteSession,
  };
})(window);
