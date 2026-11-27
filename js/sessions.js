(function () {
  "use strict";

  var pendingLineup = null;
  var pendingPlayerIds = null;

  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function fmtDuration(ms) {
    if (!ms || ms < 60000) return Math.max(0, Math.round(ms / 1000)) + "s";
    var totalMin = Math.round(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    return h ? (h + "h " + m + "m") : (m + "m");
  }

  function playerName(id) {
    var p = TichuPlayers.getPlayer(id);
    return p ? p.name : "(removed player)";
  }

  function lineupSummary(obj) {
    if (obj.mode === "threeTeams") {
      return obj.teams.map(function (team) { return team.map(playerName).join(" & "); }).join(" vs ");
    }
    if (obj.mode === "rotation") {
      return "Fixed: " + obj.fixedTeam.map(playerName).join(" & ") +
        " · Pool: " + obj.pool.map(playerName).join(", ");
    }
    return obj.teams[0].map(playerName).join(" & ") + " vs " + obj.teams[1].map(playerName).join(" & ");
  }

  // Per-session player statistics, mirroring the all-time ranking on the
  // players page: a ranking grid of the session's players plus a
  // "Sort ranking by" dropdown. The sort options are the same as
  // players.html, but computed from per-session stats; the chosen sort is
  // remembered under its own key so it doesn't clash with the all-time
  // ranking preference.
  var SESSION_RANKING_SORT_KEY = "tichuSessionRankingSort";
  var SESSION_RANKING_OPTIONS = [
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

  function getSessionRankingOption() {
    var selectedId = localStorage.getItem(SESSION_RANKING_SORT_KEY);
    return SESSION_RANKING_OPTIONS.filter(function (option) {
      return option.id === selectedId;
    })[0] || SESSION_RANKING_OPTIONS[0];
  }

  function renderPlayerSessionStats($container, session) {
    var selectId = "session-ranking-sort-" + session.id;

    var $section = $('<section class="stats-section session-player-stats"></section>');
    $section.append('<h5>Player statistics</h5>');

    var $list = $('<ol class="collection ranking-list"></ol>');
    var $sort = $('<div class="ranking-sort"></div>').append(
      $('<label></label>').attr("for", selectId).text("Sort ranking by"),
      $('<select></select>').attr("id", selectId).addClass("browser-default")
    );

    SESSION_RANKING_OPTIONS.forEach(function (option) {
      $sort.find("select").append($("<option></option>").val(option.id).text(option.label));
    });
    $sort.find("select").val(getSessionRankingOption().id);

    function renderRanking() {
      var option = getSessionRankingOption();
      var ranked = session.playerIds.map(function (pid) {
        var stats = TichuPlayers.computePlayerSessionStats(pid, session.id);
        var p = TichuPlayers.getPlayer(pid);
        return {
          playerId: pid,
          name: p ? p.name : "(removed player)",
          stats: stats,
          value: stats.gamesPlayed ? option.getValue(stats) : null
        };
      }).sort(function (a, b) {
        if (a.value === null && b.value === null) return a.name.localeCompare(b.name);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        if (b.value !== a.value) return b.value - a.value;
        return a.name.localeCompare(b.name);
      });

      $list.empty();
      ranked.forEach(function (entry, index) {
        var value = entry.value === null ? "\u2014" : option.format(entry.value, entry.stats);
        var $li = $('<li class="collection-item ranking-row"></li>');
        var $row = $('<a class="ranking-row-link" title="View statistics"></a>')
          .attr("href", "player-stats.html?id=" + encodeURIComponent(entry.playerId));
        $row.append($('<span class="ranking-position"></span>').text(index + 1));
        $row.append($('<span class="ranking-player-name"></span>').text(entry.name));
        $row.append($('<strong class="ranking-value"></strong>').text(value));
        $li.append($row);
        $list.append($li);
      });
    }

    $sort.find("select").on("change", function () {
      localStorage.setItem(SESSION_RANKING_SORT_KEY, $(this).val());
      renderRanking();
    });

    renderRanking();
    $section.append($list);
    $section.append($sort);
    $container.append($section);
  }

  function teamCard(label, ids) {
    return $('<div class="team-preview-card"></div>').append(
      $('<span class="team-preview-label"></span>').text(label),
      $('<div></div>').text(ids.map(playerName).join(" & "))
    );
  }

  function renderLineupPreview($container, playerIds, generateFn, note) {
    generateFn = generateFn || TichuPlayers.previewLineup;
    if (!pendingLineup || pendingPlayerIds !== playerIds) {
      pendingLineup = generateFn(playerIds);
      pendingPlayerIds = playerIds;
    }
    $container.empty();
    var $preview = $('<div class="teams-preview"></div>');
    if (pendingLineup.mode === "threeTeams") {
      pendingLineup.teams.forEach(function (team, i) {
        $preview.append(teamCard("Team " + (i + 1), team).addClass("team-index-" + i));
      });
    } else if (pendingLineup.mode === "fixed") {
      $preview.append(teamCard("Team 1", pendingLineup.teams[0]));
      $preview.append(teamCard("Team 2", pendingLineup.teams[1]));
    } else {
      $preview.append(teamCard("Fixed team", pendingLineup.fixedTeam));
      $preview.append(teamCard("Rotating pool", pendingLineup.pool));
    }
    $container.append($preview);
    if (pendingLineup.mode === "rotation") {
      $container.append($('<p class="helper-text"></p>').text(
        "One pool player sits out each round so everyone sits out equally often."
      ));
    }
    if (pendingLineup.mode === "threeTeams") {
      $container.append($('<p class="helper-text"></p>').text(
        "Two teams play each round while the third sits out. Each team keeps its own score."
      ));
    }
    if (note) $container.append($('<p class="helper-text"></p>').text(note));

    var $reshuffle = $('<a href="#" class="waves-effect waves-light btn-flat action-secondary"><i class="material-icons left">shuffle</i>Reshuffle</a>');
    $reshuffle.on("click", function (e) {
      e.preventDefault();
      pendingLineup = generateFn(playerIds);
      renderLineupPreview($container, playerIds, generateFn, note);
    });
    $container.append($reshuffle);
  }

  function renderGamesList(games, onDeleteGame) {
    var $list = $('<ul class="collection games-list"></ul>');
    games.forEach(function (g, i) {
      var label = "Game " + (i + 1);
      if (g.mode === "threeTeams" && ["A", "B", "C"].indexOf(g.winner) !== -1) {
        label += " \u00b7 won by " + g.teams[["A", "B", "C"].indexOf(g.winner)].map(playerName).join(" & ");
        if (g.finalScores) label += " (" + [g.finalScores.teamA, g.finalScores.teamB, g.finalScores.teamC].join(" - ") + ")";
      } else if (g.winner === "A" || g.winner === "B") {
        var winnerLabel = g.mode === "rotation"
          ? (g.winner === "A" ? g.fixedTeam.map(playerName).join(" & ") : g.pool.map(playerName).join(", "))
          : g.teams[g.winner === "A" ? 0 : 1].map(playerName).join(" & ");
        label += " · won by " + winnerLabel;
        if (g.finalScores) label += " (" + g.finalScores.teamA + " - " + g.finalScores.teamB + ")";
      } else if (g.winner === "tie") {
        label += " · tied";
        if (g.finalScores) label += " (" + g.finalScores.teamA + " - " + g.finalScores.teamB + ")";
      } else {
        label += " · in progress";
      }

      var $li = $('<li class="collection-item game-row"></li>');
      $li.append($("<span></span>").text(label));
      if (g.winner && (g.rounds || []).length) {
        $li.append($('<a class="secondary-content icon-action" title="View rounds"><i class="material-icons">chevron_right</i></a>')
          .attr("href", "round-scores.html?game=" + encodeURIComponent(g.id)));
      }
      if (g.winner && onDeleteGame) {
        var $delete = $('<button type="button" class="secondary-content icon-action delete-action" title="Delete game" aria-label="Delete game"><i class="material-icons">delete</i></button>');
        $delete.on("click", function () {
          onDeleteGame(g);
        });
        $li.append($delete);
      }
      $list.append($li);
    });
    return $list;
  }

  function goToScoreboard(game) {
    var lineup = TichuPlayers.getRoundLineup(game, 1);
    TichuStorage.resetGame();
    TichuStorage.setTeamName("A", TichuPlayers.teamNameString(lineup.teamA));
    TichuStorage.setTeamName("B", TichuPlayers.teamNameString(lineup.teamB));
    window.location.href = "index.html";
  }

  function renderStartSessionForm() {
    var active = TichuPlayers.getPlayers({ activeOnly: true, ownOnly: true });
    var $panel = $("#session-panel").empty();
    $panel.append('<div class="page-heading"><h4>New session</h4><p class="helper-text">Choose 4, 5 or 6 players to get started.</p></div>');
    if (active.length < 4) {
      $panel.append('<div class="empty-state"><i class="material-icons">group</i><p>Add at least 4 players on the <a href="players.html">Players page</a> to start a session.</p></div>');
      return;
    }

    var $list = $('<ul class="collection player-picker"></ul>');
    active.forEach(function (p) {
      var cbId = "pick-" + p.id;
      $list.append($('<li class="collection-item player-pick-row"></li>').append(
        $('<label></label>').attr("for", cbId).append(
          $('<input type="checkbox" class="filled-in player-pick" />').attr("id", cbId).val(p.id),
          $('<span></span>').text(p.name)
        )
      ));
    });
    $panel.append($list);
    $panel.append('<p id="pick-status" class="helper-text"></p>');
    $panel.append('<div id="session-team-preview"></div>');
    $panel.append('<div class="session-actions"><a href="#" class="waves-effect waves-light btn disabled" id="start-session-btn"><i class="material-icons left">play_arrow</i>Start session</a></div>');

    function selectedIds() {
      return $(".player-pick:checked").map(function () { return $(this).val(); }).get();
    }
    function refresh() {
      var ids = selectedIds();
      $(".player-pick").each(function () {
        $(this).closest(".player-pick-row").toggleClass("selected", this.checked);
      });
      $("#pick-status").text(ids.length + " selected · need 4, 5 or 6");
      if (ids.length >= 4 && ids.length <= 6) {
        $("#start-session-btn").removeClass("disabled");
        renderLineupPreview($("#session-team-preview"), ids);
      } else {
        $("#start-session-btn").addClass("disabled");
        $("#session-team-preview").empty();
        pendingLineup = null;
        pendingPlayerIds = null;
      }
    }
    $panel.on("change", ".player-pick", refresh);
    refresh();
    $("#start-session-btn").on("click", function (e) {
      e.preventDefault();
      var ids = selectedIds();
      if (ids.length < 4 || ids.length > 6) return;
      try {
        var result = TichuPlayers.startSession({ playerIds: ids, lineup: pendingLineup });
        pendingLineup = null;
        pendingPlayerIds = null;
        goToScoreboard(result.game);
      } catch (err) {
        window.alert(err.message);
      }
    });
  }

  function endSession(session) {
    var current = TichuPlayers.getCurrentGame();
    var message = current && !current.winner
      ? "End session and discard the current game? Completed games will be kept."
      : "End session? Completed games will be kept.";
    if (!window.confirm(message)) return;
    try {
      TichuPlayers.endSession(session.id);
      renderAll();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function deleteGame(game) {
    if (!window.confirm("Delete this game? Its scores and statistics will be removed from all participating players.")) return;
    try {
      TichuPlayers.deleteGame(game.id);
      renderAll();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function deleteSession(session, gameCount) {
    if (!window.confirm("Delete this session and its " + gameCount + " game" + (gameCount === 1 ? "" : "s") + "? All related scores and statistics will be removed from participating players.")) return;
    try {
      TichuPlayers.deleteSession(session.id);
      renderAll();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function renderActiveSessionPanel(session) {
    var $panel = $("#session-panel").empty();
    var games = TichuPlayers.getSessionGames(session.id);
    var currentGame = TichuPlayers.getCurrentGame();
    $panel.append('<div class="page-heading"><h4>Current session</h4><p class="helper-text">' +
      session.playerIds.map(playerName).join(" · ") + "</p></div>");

    if (currentGame && !currentGame.winner) {
      $panel.append($('<div class="session-status-card"></div>').append(
        $('<span class="status-label">Game in progress</span>'),
        $('<strong></strong>').text(lineupSummary(currentGame)),
        $('<p class="helper-text"></p>').text("Use the back arrow to return to scoring.")
      ));
    } else {
      var $preview = $('<div id="session-team-preview"></div>');
      var hasPriorGames = games.some(function (g) { return g.winner; });
      renderLineupPreview($preview, session.playerIds, function () {
        return TichuPlayers.previewLineupForSession(session.id);
      }, hasPriorGames ? "Pairings are balanced against earlier games." : null);
      $panel.append($preview);
      $panel.append('<div class="session-actions"><a href="#" class="waves-effect waves-light btn" id="new-game-btn"><i class="material-icons left">play_arrow</i>Start next game</a></div>');
      $("#new-game-btn").on("click", function (e) {
        e.preventDefault();
        try {
          goToScoreboard(TichuPlayers.startNewGameInSession(session.id, pendingLineup));
        } catch (err) {
          window.alert(err.message);
        }
      });
    }

    $panel.append('<div class="session-actions session-actions-secondary"><a href="session-details.html" class="waves-effect waves-light btn-flat"><i class="material-icons left">assessment</i><span class="btn-label">View details</span></a><a href="#" id="end-session-btn" class="waves-effect waves-light btn-flat red-text"><i class="material-icons left">stop</i><span class="btn-label">End session</span></a></div>');
    $("#end-session-btn").on("click", function (e) {
      e.preventDefault();
      endSession(session);
    });
  }

  function renderHistory() {
    var $list = $("#session-history-list").empty();
    var history = TichuPlayers.getSessionHistory();
    if (!history.length) {
      $list.append('<li class="collection-item grey-text">No sessions yet.</li>');
      return;
    }
    history.forEach(function (s) {
      var games = TichuPlayers.getSessionGames(s.id);
      var stats = TichuPlayers.computeSessionStats(s.id);
      var $li = $('<li class="collection-item history-item"></li>');
      var $summary = $('<div class="history-summary"></div>').append(
        $('<strong></strong>').text("Session · " + fmtDate(s.startedAt)),
        $('<span class="helper-text"></span>').text(games.length + " game" + (games.length === 1 ? "" : "s") + " · " + fmtDuration(stats.durationMs))
      );
      var mine = TichuPlayers.isOwn(s);
      var $deleteSession = $('<button type="button" class="session-delete-action btn-flat red-text"><i class="material-icons">delete</i>Delete session</button>');
      $deleteSession.on("click", function (e) {
        e.stopPropagation();
        deleteSession(s, games.length);
      });
      var $detail = $('<div class="history-detail hidden"></div>');
      $detail.append($('<p class="helper-text"></p>').text(s.playerIds.map(playerName).join(" · ")));
      renderPlayerSessionStats($detail, s);
      if (games.length) $detail.append(renderGamesList(games, mine ? deleteGame : null));
      $summary.on("click", function () { $detail.toggleClass("hidden"); });
      $li.append($summary);
      if (mine) $li.append($deleteSession);
      else $summary.append($('<span class="helper-text"></span>').text("Hosted by another player (read-only)"));
      $li.append($detail);
      $list.append($li);
    });
  }

  function renderLiveViews() {
    $("#live-sessions").remove();
    if (!$("#session-panel").length) return;
    var live = TichuPlayers.getSessions().filter(function (s) {
      return !TichuPlayers.isOwn(s) && (s.status === "active" || s.status === "paused");
    });
    if (!live.length) return;
    var $box = $('<section id="live-sessions"></section>');
    live.forEach(function (s) {
      var games = TichuPlayers.getSessionGames(s.id);
      $box.append('<div class="card-panel" id="readonly-banner">Live view \u2014 hosted by another player (read-only)</div>');
      $box.append($('<p class="helper-text"></p>').text(s.playerIds.map(playerName).join(" \u00b7 ")));
      if (games.length) $box.append(renderGamesList(games, null));
    });
    $("#session-panel").after($box);
  }

  function startLivePolling() {
    var cloud = window.TichuCloud;
    if (!$("#session-panel").length || !localStorage.getItem("tichuCloudUser") || !cloud || !cloud.sync.refresh) return;
    setInterval(function () {
      if (document.hidden) return;
      var before = localStorage.getItem("tichuSessions") + localStorage.getItem("tichuGames");
      cloud.getCurrentUser() && cloud.sync.refresh(cloud.getCurrentUser()).then(function () {
        if (before !== localStorage.getItem("tichuSessions") + localStorage.getItem("tichuGames")) renderAll();
      }).catch(function () {});
    }, 20000);
  }

  function renderDetails() {
    var $panel = $("#session-details-panel").empty();
    var session = TichuPlayers.getActiveOrPausedSession();
    if (!session) {
      $panel.append('<div class="empty-state"><i class="material-icons">info</i><p>No active session.</p><a href="sessions.html" class="btn">Back to sessions</a></div>');
      return;
    }
    var games = TichuPlayers.getSessionGames(session.id);
    var stats = TichuPlayers.computeSessionStats(session.id);
    $panel.append('<div class="page-heading"><h4>Session details</h4><p class="helper-text">' + session.playerIds.map(playerName).join(" · ") + "</p></div>");
    var $summary = $('<div class="session-summary-card"></div>');
    $summary.append($('<div><span class="stats-label">Games played</span><strong></strong></div>').find("strong").text(games.filter(function (g) { return g.winner; }).length).end());
    $summary.append($('<div><span class="stats-label">Duration</span><strong></strong></div>').find("strong").text(fmtDuration(stats.durationMs)).end());
    $panel.append($summary);
    renderPlayerSessionStats($panel, session);
    $panel.append("<h6>Game history</h6>");
    $panel.append(games.length ? renderGamesList(games, deleteGame) : '<p class="helper-text">No completed games yet.</p>');
  }

  function renderAll() {
    if ($("#session-panel").length) {
      var session = TichuPlayers.getActiveOrPausedSession();
      if (session) renderActiveSessionPanel(session);
      else renderStartSessionForm();
    }
    if ($("#session-history-list").length) renderHistory();
    if ($("#session-details-panel").length) renderDetails();
    renderLiveViews();
  }

  renderAll();
  startLivePolling();
})();
