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

  // A compact, ranked points leaderboard -- used both for a session's
  // live "standings so far" and for its finished-session summary in
  // history (requirements doc: "leaderboard, ranked by total points").
  function renderLeaderboard($container, leaderboard) {
    $container.empty();
    var $list = $('<ol class="collection leaderboard-list"></ol>');
    leaderboard.forEach(function (row, i) {
      var $li = $('<li class="collection-item"></li>');
      $li.append($('<span class="leaderboard-rank"></span>').text("#" + (i + 1)));
      $li.append($('<span class="leaderboard-name"></span>').text(row.playerName));
      $li.append(
        $('<span class="secondary-content leaderboard-points"></span>').text(
          row.totalPoints + " pts \u00b7 " + row.gamesWon + "/" + row.gamesPlayed + " won"
        )
      );
      $list.append($li);
    });
    $container.append($list);
  }

  function playerName(id) {
    var p = TichuPlayers.getPlayer(id);
    return p ? p.name : "(removed player)";
  }

  function lineupSummary(obj) {
    if (obj.mode === "rotation") {
      return "Fixed: " + obj.fixedTeam.map(playerName).join(" & ") +
        " \u00b7 Pool: " + obj.pool.map(playerName).join(", ");
    }
    return obj.teams[0].map(playerName).join(" & ") + " vs " + obj.teams[1].map(playerName).join(" & ");
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
      $preview.append(teamCard("Fixed Team", pendingLineup.fixedTeam));
      $preview.append(teamCard("Rotating Pool", pendingLineup.pool));
    }
    $container.append($preview);

    if (pendingLineup.mode === "rotation") {
      $container.append(
        $('<p class="grey-text" style="font-size:0.85rem"></p>').text(
          "One pool player sits out each round, in that order, then repeats — everyone sits out equally often."
        )
      );
    }
    if (note) {
      $container.append($('<p class="grey-text" style="font-size:0.85rem"></p>').text(note));
    }

    var $reshuffle = $('<a href="#" class="waves-effect waves-light btn-flat">Reshuffle teams</a>');
    $reshuffle.on("click", function (e) {
      e.preventDefault();
      pendingLineup = generateFn(playerIds);
      renderLineupPreview($container, playerIds, generateFn, note);
    });
    $container.append($reshuffle);
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
    $panel.append("<h5>Start a Session</h5>");

    if (active.length < 4) {
      $panel.append('<p class="grey-text">Add at least 4 players on the <a href="players.html">Players page</a> to start a session.</p>');
      return;
    }

    $panel.append('<p class="grey-text">Pick 4 players for two fixed teams, or 5 for one fixed team plus a rotating pool of 3.</p>');

    var $list = $('<ul class="collection"></ul>');
    active.forEach(function (p) {
      var $li = $('<li class="collection-item player-pick-row"></li>');
      var cbId = "pick-" + p.id;
      $li.append(
        $('<label></label>').attr("for", cbId).append(
          $('<input type="checkbox" class="filled-in player-pick" />').attr("id", cbId).val(p.id),
          $('<span></span>').text(p.name)
        )
      );
      $list.append($li);
    });
    $panel.append($list);

    var $status = $('<p id="pick-status"></p>');
    $panel.append($status);

    var $nameField = $('<div class="input-field"><input type="text" id="session-name-input" placeholder="Session name (optional)"></div>');
    $panel.append($nameField);

    var $preview = $('<div id="session-team-preview"></div>');
    $panel.append($preview);

    var $startBtn = $('<a href="#" class="waves-effect waves-light btn disabled" id="start-session-btn">Start Session</a>');
    $panel.append($startBtn);

    function selectedIds() {
      return $(".player-pick:checked").map(function () { return $(this).val(); }).get();
    }

    function refresh() {
      var ids = selectedIds();
      $(".player-pick").each(function () {
        $(this).closest(".player-pick-row").toggleClass("selected", this.checked);
      });
      $status.text(ids.length + " selected \u2014 need 4 (fixed teams) or 5 (rotating pool)");

      if (ids.length === 4 || ids.length === 5) {
        $startBtn.removeClass("disabled");
        renderLineupPreview($preview, ids);
      } else {
        $startBtn.addClass("disabled");
        $preview.empty();
        pendingLineup = null;
        pendingPlayerIds = null;
      }
    }
    $panel.on("change", ".player-pick", refresh);
    refresh();

    $startBtn.on("click", function (e) {
      e.preventDefault();
      var ids = selectedIds();
      if (ids.length !== 4 && ids.length !== 5) return;
      try {
        var result = TichuPlayers.startSession({
          playerIds: ids,
          name: $("#session-name-input").val(),
          lineup: pendingLineup,
        });
        pendingLineup = null;
        pendingPlayerIds = null;
        goToScoreboard(result.game);
      } catch (err) {
        window.alert(err.message);
      }
    });
  }

  function renderActiveSessionPanel(session) {
    var $panel = $("#session-panel").empty();
    var games = TichuPlayers.getSessionGames(session.id);
    var currentGame = TichuPlayers.getCurrentGame();

    var title = session.name ? session.name : "Session started " + fmtDate(session.startedAt);
    $panel.append($("<h5></h5>").text(title));
    $panel.append(
      $('<span class="chip"></span>').text(session.status === "paused" ? "Paused" : "Active")
    );
    $panel.append(
      $("<p></p>").text("Players: " + session.playerIds.map(playerName).join(", "))
    );

    if (currentGame) {
      $panel.append(
        $("<p></p>").text("Game " + (games.length) + " in progress: " + lineupSummary(currentGame))
      );
      var $continueBtn = $('<a href="#" class="waves-effect waves-light btn"></a>');
      $continueBtn.text(session.status === "paused" ? "Resume & Continue Scoring" : "Continue Scoring");
      $continueBtn.on("click", function (e) {
        e.preventDefault();
        // Coming back to an in-progress game from a paused session means
        // play is resuming, whether or not the person used the explicit
        // Resume control -- don't leave the session stuck marked Paused
        // while a game is actively being scored.
        if (session.status === "paused") TichuPlayers.resumeSession(session.id);
        goToScoreboard(currentGame);
      });
      $panel.append($continueBtn);

      if (session.status === "active") {
        // Pausing mid-game (not just between games) is deliberate --
        // e.g. closing the app for the night with a game still going.
        // The game/round data isn't touched by pausing, so it's exactly
        // where it was left once resumed.
        var $pauseMidGameBtn = $('<a href="#" class="waves-effect waves-light btn-flat">Pause Session</a>');
        $pauseMidGameBtn.on("click", function (e) {
          e.preventDefault();
          TichuPlayers.pauseSession(session.id);
          renderAll();
        });
        $panel.append($pauseMidGameBtn);
      }

      var $discardBtn = $('<a href="#" class="waves-effect waves-light btn-flat red-text">Discard Game</a>');
      $discardBtn.on("click", function (e) {
        e.preventDefault();
        if (window.confirm("Discard this in-progress game? Its scores won't be saved.")) {
          TichuPlayers.discardCurrentGame();
          renderAll();
        }
      });
      $panel.append($discardBtn);
    } else {
      if (session.status === "paused") {
        var $resumeBtn = $('<a href="#" class="waves-effect waves-light btn">Resume Session</a>');
        $resumeBtn.on("click", function (e) {
          e.preventDefault();
          TichuPlayers.resumeSession(session.id);
          renderAll();
        });
        $panel.append($resumeBtn);
      } else {
        var $preview = $('<div id="session-team-preview"></div>');
        $panel.append($preview);
        var hasPriorGames = games.some(function (g) { return g.winner; });
        var lineupGenerator = function (ids) { return TichuPlayers.previewLineupForSession(session.id); };
        var avoidanceNote = hasPriorGames
          ? "Picked to avoid repeat pairings from earlier games this session."
          : null;
        renderLineupPreview($preview, session.playerIds, lineupGenerator, avoidanceNote);

        var $newGameBtn = $('<a href="#" class="waves-effect waves-light btn">Start New Game</a>');
        $newGameBtn.on("click", function (e) {
          e.preventDefault();
          var game = TichuPlayers.startNewGameInSession(session.id, pendingLineup);
          pendingLineup = null;
          pendingPlayerIds = null;
          goToScoreboard(game);
        });
        $panel.append($newGameBtn);

        var $pauseBtn = $('<a href="#" class="waves-effect waves-light btn-flat">Pause Session</a>');
        $pauseBtn.on("click", function (e) {
          e.preventDefault();
          TichuPlayers.pauseSession(session.id);
          renderAll();
        });
        $panel.append($pauseBtn);
      }

      var $endBtn = $('<a href="#" class="waves-effect waves-light btn-flat red-text">End Session</a>');
      $endBtn.on("click", function (e) {
        e.preventDefault();
        if (window.confirm("End this session? It'll move to session history and can't be resumed.")) {
          try {
            TichuPlayers.endSession(session.id);
            renderAll();
          } catch (err) {
            window.alert(err.message);
          }
        }
      });
      $panel.append($endBtn);
    }

    if (games.length) {
      var sessionStats = TichuPlayers.computeSessionStats(session.id);
      if (sessionStats.leaderboard.some(function (row) { return row.gamesPlayed > 0; })) {
        $panel.append($("<h6></h6>").text("Standings so far"));
        var $standings = $('<div id="session-standings"></div>');
        $panel.append($standings);
        renderLeaderboard($standings, sessionStats.leaderboard);
      }

      var $gamesList = $('<ul class="collection"></ul>');
      games.forEach(function (g, i) {
        var label = "Game " + (i + 1) + ": " + lineupSummary(g);
        if (g.winner === "A" || g.winner === "B") {
          var winnerLabel;
          if (g.mode === "rotation") {
            winnerLabel = g.winner === "A" ? g.fixedTeam.map(playerName).join(" & ") : "the rotating pool team";
          } else {
            winnerLabel = g.teams[g.winner === "A" ? 0 : 1].map(playerName).join(" & ");
          }
          label += " — won by " + winnerLabel;
        } else if (g.winner) {
          label += " — finished";
        } else {
          label += " — in progress";
        }
        $gamesList.append($('<li class="collection-item"></li>').text(label));
      });
      $panel.append($gamesList);
    }
  }

  function renderSessionPanel() {
    var session = TichuPlayers.getActiveOrPausedSession();
    if (session) renderActiveSessionPanel(session);
    else renderStartSessionForm();
  }

  function renderHistory() {
    var history = TichuPlayers.getSessionHistory();
    var $list = $("#session-history-list").empty();
    if (!history.length) {
      $list.append('<li class="collection-item grey-text">No sessions yet.</li>');
      return;
    }
    history.forEach(function (s) {
      var games = TichuPlayers.getSessionGames(s.id);
      var title = s.name ? s.name : fmtDate(s.startedAt);
      var $li = $('<li class="collection-item history-item"></li>');
      var $summary = $('<div class="history-summary"></div>').text(
        title + " — " + games.length + " game" + (games.length === 1 ? "" : "s")
      );
      $li.append($summary);
      $li.append($('<div class="grey-text" style="font-size:0.85rem"></div>').text(s.playerIds.map(playerName).join(", ")));

      var $detail = $('<div class="history-detail hidden"></div>');
      $li.append($detail);

      var expanded = false;
      $summary.on("click", function () {
        expanded = !expanded;
        if (expanded && $detail.is(":empty")) {
          var stats = TichuPlayers.computeSessionStats(s.id);
          $detail.append($('<p class="grey-text" style="font-size:0.85rem"></p>').text("Duration: " + fmtDuration(stats.durationMs)));
          renderLeaderboard($detail, stats.leaderboard);
        }
        $detail.toggleClass("hidden", !expanded);
      });

      $list.append($li);
    });
  }

  function renderAll() {
    renderSessionPanel();
    renderHistory();
  }

  renderAll();
})();
