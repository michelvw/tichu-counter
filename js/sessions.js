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
    if (obj.mode === "rotation") {
      return "Fixed: " + obj.fixedTeam.map(playerName).join(" & ") +
        " · Pool: " + obj.pool.map(playerName).join(", ");
    }
    return obj.teams[0].map(playerName).join(" & ") + " vs " + obj.teams[1].map(playerName).join(" & ");
  }

  function renderLeaderboard($container, leaderboard) {
    var $list = $('<ol class="collection leaderboard-list"></ol>');
    leaderboard.forEach(function (row, i) {
      var $li = $('<li class="collection-item"></li>');
      $li.append($('<span class="leaderboard-rank"></span>').text("#" + (i + 1)));
      $li.append($('<span class="leaderboard-name"></span>').text(row.playerName));
      $li.append($('<span class="secondary-content leaderboard-points"></span>').text(
        row.totalPoints + " pts · " + row.gamesWon + "/" + row.gamesPlayed + " won"
      ));
      $list.append($li);
    });
    $container.append($list);
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
    if (pendingLineup.mode === "fixed") {
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
    if (note) $container.append($('<p class="helper-text"></p>').text(note));

    var $reshuffle = $('<a href="#" class="waves-effect waves-light btn-flat action-secondary"><i class="material-icons left">shuffle</i>Reshuffle</a>');
    $reshuffle.on("click", function (e) {
      e.preventDefault();
      pendingLineup = generateFn(playerIds);
      renderLineupPreview($container, playerIds, generateFn, note);
    });
    $container.append($reshuffle);
  }

  function renderGamesList(games) {
    var $list = $('<ul class="collection games-list"></ul>');
    games.forEach(function (g, i) {
      var label = "Game " + (i + 1);
      if (g.winner === "A" || g.winner === "B") {
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
    var active = TichuPlayers.getPlayers({ activeOnly: true });
    var $panel = $("#session-panel").empty();
    $panel.append('<div class="page-heading"><h4>New session</h4><p class="helper-text">Choose 4 or 5 players to get started.</p></div>');
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
      $("#pick-status").text(ids.length + " selected · need 4 or 5");
      if (ids.length === 4 || ids.length === 5) {
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
      if (ids.length !== 4 && ids.length !== 5) return;
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
    if (!window.confirm("End session and discard the current game? Completed games will be kept.")) return;
    try {
      TichuPlayers.endSession(session.id);
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

    if (currentGame) {
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

    $panel.append('<div class="session-actions session-actions-secondary"><a href="session-details.html" class="waves-effect waves-light btn-flat"><i class="material-icons left">insights</i>View details</a><a href="#" id="end-session-btn" class="waves-effect waves-light btn-flat red-text"><i class="material-icons left">stop</i>End session</a></div>');
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
      var $detail = $('<div class="history-detail hidden"></div>');
      $detail.append($('<p class="helper-text"></p>').text(s.playerIds.map(playerName).join(" · ")));
      renderLeaderboard($detail, stats.leaderboard);
      if (games.length) $detail.append(renderGamesList(games));
      $summary.on("click", function () { $detail.toggleClass("hidden"); });
      $li.append($summary, $detail);
      $list.append($li);
    });
  }

  function renderDetails() {
    var $panel = $("#session-details-panel").empty();
    var session = TichuPlayers.getActiveOrPausedSession();
    if (!session) {
      $panel.append('<div class="empty-state"><i class="material-icons">insights</i><p>No active session.</p><a href="sessions.html" class="btn">Back to sessions</a></div>');
      return;
    }
    var games = TichuPlayers.getSessionGames(session.id);
    var stats = TichuPlayers.computeSessionStats(session.id);
    $panel.append('<div class="page-heading"><h4>Session details</h4><p class="helper-text">' + session.playerIds.map(playerName).join(" · ") + "</p></div>");
    var $summary = $('<div class="session-summary-card"></div>');
    $summary.append($('<div><span class="stats-label">Games played</span><strong></strong></div>').find("strong").text(games.filter(function (g) { return g.winner; }).length).end());
    $summary.append($('<div><span class="stats-label">Duration</span><strong></strong></div>').find("strong").text(fmtDuration(stats.durationMs)).end());
    $panel.append($summary);
    $panel.append("<h6>Standings</h6>");
    renderLeaderboard($panel, stats.leaderboard);
    $panel.append("<h6>Game history</h6>");
    $panel.append(games.length ? renderGamesList(games) : '<p class="helper-text">No completed games yet.</p>');
  }

  function renderAll() {
    if ($("#session-panel").length) {
      var session = TichuPlayers.getActiveOrPausedSession();
      if (session) renderActiveSessionPanel(session);
      else renderStartSessionForm();
    }
    if ($("#session-history-list").length) renderHistory();
    if ($("#session-details-panel").length) renderDetails();
  }

  renderAll();
})();
