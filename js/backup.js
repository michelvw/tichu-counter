/**
 * TichuBackup: export/import of all local data using the canonical
 * schemaVersion 1 JSON shared with the Tichu Counter Android app.
 * Legacy PWA exports (raw localStorage key dump, no schemaVersion) are
 * also accepted on import.
 */
(function (global) {
  "use strict";

  var QUICK_GAME_ID = "q_pwa";
  var LEGACY_KEYS = [
    "tichuPlayers", "tichuSessions", "tichuGames", "tichuCurrentGameId",
    "A_points", "B_points", "teamAName", "teamBName", "roundScores", "roundNumber",
    "winThreshold", "chipsVisible", "tichuTheme", "tichuModeHintDismissed",
    "tichuPlayersRankingSort", "tichuSessionRankingSort"
  ];
  var DATA_KEYS = LEGACY_KEYS.filter(function (key) { return key !== "tichuTheme"; }).concat(["tichuTheme"]);

  function readRaw(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function readList(key) {
    try {
      var value = JSON.parse(readRaw(key));
      return Array.isArray(value) ? value : [];
    } catch (e) {
      return [];
    }
  }
  function toInt(value, fallback) {
    var n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }
  function nonEmptyString(value, fallback) {
    return typeof value === "string" && value.trim() ? value : fallback;
  }
  function list(value) { return Array.isArray(value) ? value : []; }

  function modFromLabel(label) {
    label = label || "";
    if (label.indexOf("<s>GT</s>") !== -1) return -200;
    if (label.indexOf("<s>T</s>") !== -1) return -100;
    if (label.indexOf("GT") !== -1) return 200;
    if (label.indexOf("T") !== -1) return 100;
    return 0;
  }
  function labelFromMod(mod, doubleWin) {
    var text = mod === 200 ? "GT" : mod === 100 ? "T" : mod === -200 ? "<s>GT</s>" : mod === -100 ? "<s>T</s>" : "";
    return (doubleWin ? "\u21c9 " : "") + text;
  }

  // ---- Export --------------------------------------------------------

  function exportRound(game, round, index) {
    if (game.mode === "threeTeams") {
      return {
        roundNumber: index + 1,
        scores: list(round.scores),
        activeTeams: list(round.activeTeams),
        tichuMods: list(round.tichuMods).map(function (m) { return m || 0; }),
        doubleWins: list(round.doubleWins).map(Boolean),
        sittingOutPlayerId: null,
        dealerPlayerId: round.dealerPlayerId || null
      };
    }
    var hasArrays = Array.isArray(round.scores);
    return {
      roundNumber: index + 1,
      scores: hasArrays ? round.scores.slice(0, 2) : [round.teamAPoints || 0, round.teamBPoints || 0],
      activeTeams: [0, 1],
      tichuMods: hasArrays ? list(round.tichuMods).slice(0, 2) : [round.teamATichuMod || 0, round.teamBTichuMod || 0],
      doubleWins: hasArrays ? list(round.doubleWins).slice(0, 2) : [!!round.teamADoubleWin, !!round.teamBDoubleWin],
      sittingOutPlayerId: round.sittingOutPlayerId || null,
      dealerPlayerId: round.dealerPlayerId || null
    };
  }

  function exportGame(game, winThreshold) {
    var rounds = list(game.rounds).map(function (r, i) { return exportRound(game, r, i); });
    var last = rounds[rounds.length - 1];
    var finalScores = null;
    if (game.winner && last) {
      finalScores = { teamA: last.scores[0] || 0, teamB: last.scores[1] || 0, teamC: game.mode === "threeTeams" ? (last.scores[2] || 0) : null };
    }
    return {
      id: game.id,
      sessionId: game.sessionId || null,
      mode: game.mode || "fixed",
      teams: list(game.teams),
      fixedTeam: list(game.fixedTeam),
      pool: list(game.pool),
      firstRestingTeam: typeof game.firstRestingTeam === "number" ? game.firstRestingTeam : null,
      winThreshold: winThreshold,
      teamAName: "Team A",
      teamBName: "Team B",
      winner: game.winner || null,
      pendingNextGame: !!game.pendingNextGame,
      finalScores: finalScores,
      nextDealerPlayerId: game.nextDealerPlayerId || null,
      startedAt: game.startedAt || Date.now(),
      endedAt: game.endedAt || null,
      rounds: rounds
    };
  }

  function exportQuickGame(winThreshold, now) {
    var scores = readList("roundScores");
    if (!scores.length) return null;
    return {
      id: QUICK_GAME_ID,
      sessionId: null,
      mode: "quick",
      teams: [], fixedTeam: [], pool: [],
      firstRestingTeam: null,
      winThreshold: winThreshold,
      teamAName: nonEmptyString(readRaw("teamAName"), "Team A"),
      teamBName: nonEmptyString(readRaw("teamBName"), "Team B"),
      winner: null,
      pendingNextGame: false,
      finalScores: null,
      nextDealerPlayerId: null,
      startedAt: now,
      endedAt: null,
      rounds: scores.map(function (entry, i) {
        var a = entry.teamATichu || "";
        var b = entry.teamBTichu || "";
        return {
          roundNumber: i + 1,
          scores: [entry.teamA || 0, entry.teamB || 0],
          activeTeams: [0, 1],
          tichuMods: [modFromLabel(a), modFromLabel(b)],
          doubleWins: [a.indexOf("\u21c9") !== -1, b.indexOf("\u21c9") !== -1],
          sittingOutPlayerId: null,
          dealerPlayerId: null
        };
      })
    };
  }

  function exportData() {
    var now = Date.now();
    var winThreshold = Math.max(1, toInt(readRaw("winThreshold"), 500));
    var theme = readRaw("tichuTheme");
    var games = readList("tichuGames");
    var currentId = readRaw("tichuCurrentGameId");
    var currentSessionGame = games.filter(function (g) {
      return g.id === currentId && (!g.winner || g.pendingNextGame);
    })[0];
    var exportedGames = games.map(function (g) { return exportGame(g, winThreshold); });
    var quick = currentSessionGame ? null : exportQuickGame(winThreshold, now);
    if (quick) exportedGames.push(quick);

    return {
      schemaVersion: 1,
      exportedAt: now,
      preferences: {
        themeMode: theme === "light" || theme === "dark" ? theme : "system",
        winThreshold: winThreshold,
        chipsVisible: readRaw("chipsVisible") !== "false",
        modeHintDismissed: readRaw("tichuModeHintDismissed") === "true",
        playersRankingSort: readRaw("tichuPlayersRankingSort") || "totalPoints",
        sessionRankingSort: readRaw("tichuSessionRankingSort") || "totalPoints",
        currentSessionGameId: currentSessionGame ? currentSessionGame.id : null,
        quickGameId: quick ? quick.id : null,
        quickTeamAName: nonEmptyString(readRaw("teamAName"), "Team A"),
        quickTeamBName: nonEmptyString(readRaw("teamBName"), "Team B")
      },
      players: readList("tichuPlayers").map(function (p) {
        return {
          id: p.id, name: p.name, active: p.active !== false,
          createdAt: p.createdAt || now, statsResetAt: p.statsResetAt || null
        };
      }),
      sessions: readList("tichuSessions").map(function (s) {
        return {
          id: s.id, status: s.status, playerIds: list(s.playerIds),
          nextPoolStart: s.nextPoolStart || 0, pauseLog: list(s.pauseLog),
          startedAt: s.startedAt || now, endedAt: s.endedAt || null
        };
      }),
      games: exportedGames
    };
  }

  function exportJSON() {
    return JSON.stringify(exportData(), null, 2);
  }

  // ---- Import --------------------------------------------------------

  function parse(text) {
    var root;
    try {
      root = JSON.parse(text);
    } catch (e) {
      throw new Error("Could not parse JSON. Check that the file or pasted text is valid JSON.");
    }
    if (!root || typeof root !== "object" || Array.isArray(root)) {
      throw new Error("Unrecognized JSON format.");
    }
    if (root.schemaVersion !== undefined) {
      if (!(root.schemaVersion >= 1)) throw new Error("Unsupported backup schema version.");
      return { kind: "backup", data: root };
    }
    var isLegacy = Object.keys(root).some(function (key) { return LEGACY_KEYS.indexOf(key) !== -1; });
    if (!isLegacy) throw new Error("Unrecognized JSON format. Select a Tichu Counter backup or an older PWA export.");
    return { kind: "legacy", data: root };
  }

  // Legacy exports hold localStorage strings, which may already be parsed.
  function legacyList(value) {
    if (Array.isArray(value)) return value;
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function summarize(parsed) {
    var players, sessions, sessionGames, quickRounds = 0;
    if (parsed.kind === "legacy") {
      players = legacyList(parsed.data.tichuPlayers).length;
      sessions = legacyList(parsed.data.tichuSessions).length;
      sessionGames = legacyList(parsed.data.tichuGames).length;
      quickRounds = legacyList(parsed.data.roundScores).length;
    } else {
      players = list(parsed.data.players).length;
      sessions = list(parsed.data.sessions).length;
      var games = list(parsed.data.games);
      sessionGames = games.filter(function (g) { return g.sessionId; }).length;
      var quick = games.filter(function (g) { return !g.sessionId && g.mode === "quick"; })[0];
      quickRounds = quick ? list(quick.rounds).length : 0;
    }
    function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
    var parts = [plural(players, "player", "players"), plural(sessions, "session", "sessions"),
      plural(sessionGames, "session game", "session games")];
    if (quickRounds) parts.push("Quick Game (" + plural(quickRounds, "round", "rounds") + ")");
    return "Found " + parts.join(", ") + ".";
  }

  function importRound(game, r) {
    if (game.mode === "threeTeams") {
      var active = list(r.activeTeams);
      var mods = [0, 1, 2].map(function (i) { return active.indexOf(i) === -1 ? null : (list(r.tichuMods)[i] || 0); });
      return {
        scores: list(r.scores).slice(0, 3), activeTeams: active, tichuMods: mods,
        doubleWins: [0, 1, 2].map(function (i) { return !!list(r.doubleWins)[i]; }),
        dealerPlayerId: r.dealerPlayerId || undefined
      };
    }
    var scores = list(r.scores), mods2 = list(r.tichuMods), doubles = list(r.doubleWins);
    var out = {
      teamAPoints: scores[0] || 0, teamBPoints: scores[1] || 0,
      teamATichuMod: mods2[0] || 0, teamBTichuMod: mods2[1] || 0,
      teamADoubleWin: !!doubles[0], teamBDoubleWin: !!doubles[1]
    };
    if (r.sittingOutPlayerId) out.sittingOutPlayerId = r.sittingOutPlayerId;
    if (r.dealerPlayerId) out.dealerPlayerId = r.dealerPlayerId;
    return out;
  }

  function importGame(g) {
    var mode = g.mode === "threeTeams" || g.mode === "rotation" ? g.mode : "fixed";
    var game = {
      id: g.id, sessionId: g.sessionId, mode: mode, winner: g.winner || null,
      startedAt: g.startedAt || Date.now(), endedAt: g.endedAt || null, rounds: []
    };
    if (mode === "rotation") {
      game.fixedTeam = list(g.fixedTeam);
      game.pool = list(g.pool);
    } else {
      game.teams = list(g.teams);
    }
    if (typeof g.firstRestingTeam === "number") game.firstRestingTeam = g.firstRestingTeam;
    if (g.pendingNextGame) game.pendingNextGame = true;
    if (g.nextDealerPlayerId) game.nextDealerPlayerId = g.nextDealerPlayerId;
    game.rounds = list(g.rounds)
      .slice().sort(function (a, b) { return (a.roundNumber || 0) - (b.roundNumber || 0); })
      .map(function (r) { return importRound(game, r); });
    return game;
  }

  function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function setOrRemove(key, value) {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  }

  function clearAll() {
    DATA_KEYS.forEach(function (key) { localStorage.removeItem(key); });
  }

  function applyLegacy(data) {
    clearAll();
    DATA_KEYS.forEach(function (key) {
      if (data[key] === undefined || data[key] === null) return;
      localStorage.setItem(key, typeof data[key] === "string" ? data[key] : JSON.stringify(data[key]));
    });
  }

  function applyBackup(data) {
    var prefs = data.preferences || {};
    var playerIds = {};
    var players = list(data.players).filter(function (p) { return p && p.id; }).map(function (p) {
      playerIds[p.id] = true;
      return {
        id: p.id, name: nonEmptyString(p.name, "Player"), active: p.active !== false,
        createdAt: p.createdAt || Date.now(), statsResetAt: p.statsResetAt || null
      };
    });
    var sessions = list(data.sessions).filter(function (s) { return s && s.id; }).map(function (s) {
      return {
        id: s.id, status: s.status === "paused" || s.status === "ended" ? s.status : "active",
        startedAt: s.startedAt || Date.now(), endedAt: s.endedAt || null, playerIds: list(s.playerIds),
        nextPoolStart: s.nextPoolStart || 0, pauseLog: list(s.pauseLog)
      };
    });
    var sessionIds = {};
    sessions.forEach(function (s) { sessionIds[s.id] = true; });
    var rawGames = list(data.games);
    var games = rawGames
      .filter(function (g) { return g && g.id && g.sessionId && sessionIds[g.sessionId]; })
      .map(importGame);
    var quick = rawGames.filter(function (g) {
      return g && !g.sessionId && g.mode === "quick" && list(g.rounds).length;
    })[0];

    clearAll();
    writeJSON("tichuPlayers", players);
    writeJSON("tichuSessions", sessions);
    writeJSON("tichuGames", games);
    var current = games.filter(function (g) {
      return g.id === prefs.currentSessionGameId && (!g.winner || g.pendingNextGame);
    })[0];
    setOrRemove("tichuCurrentGameId", current ? current.id : null);

    var threshold = Math.max(1, toInt(prefs.winThreshold, 500));
    localStorage.setItem("winThreshold", threshold);
    localStorage.setItem("chipsVisible", prefs.chipsVisible === false ? "false" : "true");
    setOrRemove("tichuModeHintDismissed", prefs.modeHintDismissed ? "true" : null);
    setOrRemove("tichuTheme", prefs.themeMode === "light" || prefs.themeMode === "dark" ? prefs.themeMode : null);
    setOrRemove("tichuPlayersRankingSort", prefs.playersRankingSort);
    setOrRemove("tichuSessionRankingSort", prefs.sessionRankingSort);
    localStorage.setItem("teamAName", nonEmptyString(prefs.quickTeamAName, "Team A"));
    localStorage.setItem("teamBName", nonEmptyString(prefs.quickTeamBName, "Team B"));

    if (quick) {
      var roundScores = list(quick.rounds).map(function (r) {
        var scores = list(r.scores), mods = list(r.tichuMods), doubles = list(r.doubleWins);
        return {
          teamA: scores[0] || 0, teamB: scores[1] || 0,
          teamATichu: labelFromMod(mods[0] || 0, doubles[0]),
          teamBTichu: labelFromMod(mods[1] || 0, doubles[1])
        };
      });
      var last = roundScores[roundScores.length - 1];
      writeJSON("roundScores", roundScores);
      localStorage.setItem("A_points", last.teamA);
      localStorage.setItem("B_points", last.teamB);
      localStorage.setItem("roundNumber", roundScores.length + 1);
    }
  }

  function applyImport(parsed) {
    if (parsed.kind === "legacy") applyLegacy(parsed.data);
    else applyBackup(parsed.data);
  }

  global.TichuBackup = {
    exportData: exportData,
    exportJSON: exportJSON,
    parse: parse,
    summarize: summarize,
    applyImport: applyImport,
    clearAll: clearAll
  };
})(window);
