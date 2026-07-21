(function () {
  "use strict";

  function fmtStatsLine(stats) {
    if (!stats.gamesPlayed) {
      return "No session games played yet (" + stats.sessionsAttended + " session" + (stats.sessionsAttended === 1 ? "" : "s") + " joined).";
    }
    var lines = [];
    lines.push(stats.gamesPlayed + " games \u00b7 " + stats.gamesWon + "W-" + stats.gamesLost + "L (" + stats.winPct + "%)");
    lines.push(stats.totalPoints + " total pts \u00b7 " + stats.avgPointsPerGame + " avg \u00b7 " + stats.bestGameScore + " best game");
    var tichuBits = [];
    if (stats.tichuWon || stats.tichuLost) tichuBits.push("Tichu " + stats.tichuWon + "W/" + stats.tichuLost + "L");
    if (stats.grandTichuWon || stats.grandTichuLost) tichuBits.push("Grand Tichu " + stats.grandTichuWon + "W/" + stats.grandTichuLost + "L");
    if (stats.doubleWins) tichuBits.push(stats.doubleWins + " double win" + (stats.doubleWins === 1 ? "" : "s"));
    if (tichuBits.length) lines.push(tichuBits.join(" \u00b7 "));
    lines.push(stats.sessionsAttended + " session" + (stats.sessionsAttended === 1 ? "" : "s") + " played");
    return lines;
  }

  function renderRoster() {
    var active = TichuPlayers.getPlayers({ activeOnly: true });
    var $active = $("#active-players-list").empty();
    if (!active.length) {
      $active.append('<li class="collection-item grey-text">No players yet — add your first one below.</li>');
    }
    active.forEach(function (p) {
      var $li = $('<li class="collection-item"></li>');
      $li.append($('<span></span>').text(p.name));
      var $actions = $('<span class="secondary-content"></span>');
      var $stats = $('<a href="#" title="All-time stats"><i class="material-icons">bar_chart</i></a>');
      var $statsBlock = $('<div class="player-stats-block hidden"></div>');
      var statsShown = false;
      $stats.on("click", function (e) {
        e.preventDefault();
        statsShown = !statsShown;
        if (statsShown && $statsBlock.is(":empty")) {
          var lines = fmtStatsLine(TichuPlayers.computePlayerAllTimeStats(p.id));
          (Array.isArray(lines) ? lines : [lines]).forEach(function (line) {
            $statsBlock.append($('<p class="grey-text" style="font-size:0.85rem; margin: 4px 0;"></p>').text(line));
          });
        }
        $statsBlock.toggleClass("hidden", !statsShown);
      });
      var $rename = $('<a href="#" title="Rename"><i class="material-icons">edit</i></a>');
      $rename.on("click", function (e) {
        e.preventDefault();
        var name = window.prompt("Rename player", p.name);
        if (name && name.trim()) {
          TichuPlayers.renamePlayer(p.id, name.trim());
          renderRoster();
        }
      });
      var $archive = $('<a href="#" title="Archive"><i class="material-icons">archive</i></a>');
      $archive.on("click", function (e) {
        e.preventDefault();
        if (window.confirm(p.name + ' will be hidden from future sessions but keeps their history. Archive them?')) {
          TichuPlayers.archivePlayer(p.id);
          renderRoster();
        }
      });
      $actions.append($stats).append($rename).append($archive);
      $li.append($actions);
      $li.append($statsBlock);
      $active.append($li);
    });

    var archived = TichuPlayers.getPlayers().filter(function (p) { return !p.active; });
    var $archived = $("#archived-players-list").empty();
    archived.forEach(function (p) {
      var $li = $('<li class="collection-item"></li>');
      $li.append($('<span class="grey-text"></span>').text(p.name));
      var $unarchive = $('<a href="#" class="secondary-content" title="Restore">Restore</a>');
      $unarchive.on("click", function (e) {
        e.preventDefault();
        TichuPlayers.unarchivePlayer(p.id);
        renderRoster();
      });
      $li.append($unarchive);
      $archived.append($li);
    });
    $("#toggle-archived").text(archived.length ? "Show archived players (" + archived.length + ")" : "No archived players");
  }

  $("#add-player-btn").on("click", function (e) {
    e.preventDefault();
    var $input = $("#new-player-name");
    var name = $input.val();
    try {
      TichuPlayers.addPlayer(name);
      $input.val("");
      renderRoster();
    } catch (err) {
      window.alert(err.message);
    }
  });
  $("#new-player-name").on("keydown", function (e) {
    if (e.key === "Enter") $("#add-player-btn").click();
  });

  $("#toggle-archived").on("click", function (e) {
    e.preventDefault();
    $("#archived-players-list").toggleClass("hidden");
  });

  renderRoster();
})();
