/**
 * TichuStorage: single source of truth for the localStorage keys and
 * shapes this app uses. Both js/script.js (main screen) and
 * js/round-scores.js (scores/graph screen) read and write game state
 * through this module instead of calling localStorage directly, so
 * there's exactly one place that knows the actual key names.
 */
(function (global) {
  "use strict";

  var KEYS = {
    POINTS_A: "A_points",
    POINTS_B: "B_points",
    TEAM_NAME_A: "teamAName",
    TEAM_NAME_B: "teamBName",
    ROUND_SCORES: "roundScores",
    ROUND_NUMBER: "roundNumber",
    WIN_THRESHOLD: "winThreshold",
    CHIPS_VISIBLE: "chipsVisible",
  };

  function getInt(key, fallback) {
    var value = parseInt(localStorage.getItem(key), 10);
    return isNaN(value) ? fallback : value;
  }

  function teamNameKey(team) {
    return team === "A" ? KEYS.TEAM_NAME_A : KEYS.TEAM_NAME_B;
  }

  function pointsKey(team) {
    return team === "A" ? KEYS.POINTS_A : KEYS.POINTS_B;
  }

  var TichuStorage = {
    KEYS: KEYS,

    getTeamName: function (team) {
      return localStorage.getItem(teamNameKey(team)) || "Team " + team;
    },
    setTeamName: function (team, name) {
      localStorage.setItem(teamNameKey(team), name);
    },

    getPoints: function (team) {
      return getInt(pointsKey(team), 0);
    },
    setPoints: function (team, value) {
      localStorage.setItem(pointsKey(team), value);
    },

    getRoundScores: function () {
      try {
        return JSON.parse(localStorage.getItem(KEYS.ROUND_SCORES)) || [];
      } catch (e) {
        return [];
      }
    },
    setRoundScores: function (roundScores) {
      localStorage.setItem(KEYS.ROUND_SCORES, JSON.stringify(roundScores));
    },
    clearRoundScores: function () {
      localStorage.removeItem(KEYS.ROUND_SCORES);
    },

    getRoundNumber: function () {
      return getInt(KEYS.ROUND_NUMBER, 1);
    },
    setRoundNumber: function (value) {
      localStorage.setItem(KEYS.ROUND_NUMBER, value);
    },

    getWinThreshold: function () {
      return getInt(KEYS.WIN_THRESHOLD, 500);
    },
    setWinThreshold: function (value) {
      localStorage.setItem(KEYS.WIN_THRESHOLD, value);
    },

    getChipsVisible: function () {
      return localStorage.getItem(KEYS.CHIPS_VISIBLE) !== "false";
    },
    setChipsVisible: function (value) {
      localStorage.setItem(KEYS.CHIPS_VISIBLE, value);
    },

    // Resets per-game state (scores, round count) but deliberately
    // leaves team names and the win threshold alone, since those are
    // table/game-night settings rather than state tied to one game.
    resetGame: function () {
      this.clearRoundScores();
      this.setPoints("A", 0);
      this.setPoints("B", 0);
      this.setRoundNumber(1);
    },
  };

  global.TichuStorage = TichuStorage;
})(window);
