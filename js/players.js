(function () {
  "use strict";

  var RANKING_SORT_KEY = "tichuPlayersRankingSort";
  var RANKING_OPTIONS = [
    {
      id: "totalPoints",
      label: "Total points",
      getValue: function (stats) { return stats.totalPoints; },
      format: function (value) { return value + " pts"; }
    },
    {
      id: "bestGameScore",
      label: "Best game points",
      getValue: function (stats) { return stats.bestGameScore; },
      format: function (value) { return value + " pts"; }
    },
    {
      id: "winRate",
      label: "Win rate",
      getValue: function (stats) { return stats.winPct; },
      format: function (value, stats) {
        return value + "% (" + stats.gamesWon + "/" + stats.gamesPlayed + ")";
      }
    },
    {
      id: "averagePoints",
      label: "Point average",
      getValue: function (stats) { return stats.avgPointsPerGame; },
      format: function (value) { return value + " pts"; }
    },
    {
      id: "doubleWins",
      label: "Double wins",
      getValue: function (stats) { return stats.doubleWins; },
      format: function (value) { return value; }
    },
    {
      id: "grandTichuNet",
      label: "Grand Tichu",
      getValue: function (stats) { return stats.grandTichuWon - stats.grandTichuLost; },
      format: function (value, stats) {
        return value + " (" + stats.grandTichuWon + "W minus " + stats.grandTichuLost + "L)";
      }
    },
    {
      id: "tichuNet",
      label: "Tichu",
      getValue: function (stats) { return stats.tichuWon - stats.tichuLost; },
      format: function (value, stats) {
        return value + " (" + stats.tichuWon + "W minus " + stats.tichuLost + "L)";
      }
    }
  ];

  function getRankingOption() {
    var selectedId = localStorage.getItem(RANKING_SORT_KEY);
    return RANKING_OPTIONS.filter(function (option) {
      return option.id === selectedId;
    })[0] || RANKING_OPTIONS[0];
  }

  function renderRanking() {
    var option = getRankingOption();
    var rankedPlayers = TichuPlayers.getPlayers({ activeOnly: true }).map(function (player) {
      var stats = TichuPlayers.computePlayerAllTimeStats(player.id);
      return {
        player: player,
        stats: stats,
        value: stats.gamesPlayed ? option.getValue(stats) : null
      };
    }).sort(function (a, b) {
      if (a.value === null && b.value === null) return a.player.name.localeCompare(b.player.name);
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      if (b.value !== a.value) return b.value - a.value;
      return a.player.name.localeCompare(b.player.name);
    });

    var $ranking = $("#player-ranking-list").empty();
    if (!rankedPlayers.length) {
      $ranking.append('<li class="collection-item grey-text">No players to rank yet.</li>');
      return;
    }

    rankedPlayers.forEach(function (entry, index) {
      var value = entry.value === null ? "\u2014" : option.format(entry.value, entry.stats);
      var $li = $('<li class="collection-item ranking-row"></li>');
      var $link = $('<a class="ranking-row-link" title="View statistics"></a>')
        .attr("href", "player-stats.html?id=" + encodeURIComponent(entry.player.id));
      $link.append($('<span class="ranking-position"></span>').text(index + 1));
      $link.append($('<span class="ranking-player-name"></span>').text(entry.player.name));
      $link.append($('<strong class="ranking-value"></strong>').text(value));
      $li.append($link);
      $ranking.append($li);
    });
  }

  function renderRankingOptions() {
    var $select = $("#ranking-sort").empty();
    RANKING_OPTIONS.forEach(function (option) {
      $select.append($("<option></option>").val(option.id).text(option.label));
    });
    $select.val(getRankingOption().id);
  }

  function renderRoster() {
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
    renderRanking();
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

  $("#ranking-sort").on("change", function () {
    localStorage.setItem(RANKING_SORT_KEY, $(this).val());
    renderRanking();
  });

  renderRankingOptions();
  renderRoster();
})();
