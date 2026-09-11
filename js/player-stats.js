(function () {
  "use strict";

  var playerId = new URLSearchParams(window.location.search).get("id");
  var player = playerId ? TichuPlayers.getPlayer(playerId) : null;
  var $error = $("#stats-error");

  if (!player) {
    $error.text("That player could not be found.");
    return;
  }

  function setText(id, value) {
    $("#" + id).text(value);
  }

  function render() {
    var stats = TichuPlayers.computePlayerAllTimeStats(player.id);
    setText("player-name", player.name);
    setText("player-avatar", player.name.charAt(0).toUpperCase());
    setText("win-rate", stats.winPct + "%");
    setText("record", stats.gamesWon + " wins \u00b7 " + stats.gamesLost + " losses");
    setText("games-played", stats.gamesPlayed);
    setText("total-points", stats.totalPoints);
    setText("average-points", stats.avgPointsPerGame);
    setText("best-game", stats.bestGameScore === null ? "\u2014" : stats.bestGameScore);
    setText("tichu-record", stats.tichuWon + "W \u00b7 " + stats.tichuLost + "L");
    setText("grand-tichu-record", stats.grandTichuWon + "W \u00b7 " + stats.grandTichuLost + "L");
    setText("double-wins", stats.doubleWins);
    setText("sessions-attended", stats.sessionsAttended);
    $("#stats-content").removeClass("hidden");
  }

  $("#reset-player-stats").on("click", function () {
    if (window.confirm("Reset " + player.name + "'s statistics? Their player profile and future games will be kept.")) {
      TichuPlayers.resetPlayerStatistics(player.id);
      render();
    }
  });

  render();
})();
