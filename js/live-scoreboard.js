// View mode for the main scoreboard: a signed-in user without a session of
// their own follows the game of another host's active session, read-only.
(function () {
  if (typeof TichuPlayers === "undefined" || !TichuPlayers.getLiveSharedSession) return;

  var dismissedKey = null;

  function liveGame() {
    return TichuPlayers.getLiveSharedGame(TichuPlayers.getLiveSharedSession());
  }

  function names(ids) { return TichuPlayers.teamNameString(ids); }

  function renderTwoTeam(game, scores, threshold) {
    var lineup = TichuPlayers.getRoundLineup(game, game.rounds.length + 1);
    var nameA = names(lineup.teamA);
    var nameB = names(game.mode === "rotation" ? game.pool : lineup.teamB);
    $("#teamAName").val(nameA);
    $("#teamBName").val(nameB);
    $("#A .points").text(scores[0]);
    $("#B .points").text(scores[1]);
    var goal = Math.max(threshold, 1);
    var left = function (s) { return Math.max(goal - s, 0); };
    $("#progress-goal, #progress-goal-marker-label").text(threshold);
    $("#progress-fill-a").css("width", (Math.max(0, Math.min(scores[0] / goal, 1)) * 50) + "%");
    $("#progress-fill-b").css("width", (Math.max(0, Math.min(scores[1] / goal, 1)) * 50) + "%");
    $("#progress-remaining-a").text(nameA + ": " + (left(scores[0]) ? left(scores[0]) + " left" : "Goal reached"));
    $("#progress-remaining-b").text(nameB + ": " + (left(scores[1]) ? left(scores[1]) + " left" : "Goal reached"));
    $("#game-progress").removeClass("hidden");
    $("#three-team-scores").addClass("hidden");
    $("body").removeClass("three-team-mode");
    $("#A, #B").removeClass("team-index-0 team-index-1 team-index-2");
    var over = [];
    if (scores[0] >= threshold) over.push(nameA);
    if (scores[1] >= threshold) over.push(nameB);
    return over.length ? over.join(" & ") + (over.length > 1 ? " have" : " has") + " reached " + threshold + " points! \uD83C\uDF89" : null;
  }

  function renderThreeTeam(game, scores, threshold) {
    var finished = !!game.winner;
    var lineup = TichuPlayers.getRoundLineup(game, finished ? Math.max(game.rounds.length, 1) : game.rounds.length + 1);
    $("body").addClass("three-team-mode");
    $("#game-progress").addClass("hidden");
    $("#three-team-scores").removeClass("hidden");
    var a = lineup.activeIndices[0];
    var b = lineup.activeIndices[1];
    $("#teamAName").val(names(game.teams[a]));
    $("#teamBName").val(names(game.teams[b]));
    $("#A .points").text(scores[a]);
    $("#B .points").text(scores[b]);
    $("#A, #B").removeClass("team-index-0 team-index-1 team-index-2");
    $("#A").addClass("team-index-" + a);
    $("#B").addClass("team-index-" + b);
    var $scores = $("#three-team-scores").empty();
    $scores.append($('<div class="three-team-target"></div>').text("Goal: " + threshold));
    var goal = Math.max(threshold, 1);
    game.teams.forEach(function (team, index) {
      var remaining = Math.max(goal - scores[index], 0);
      var progress = Math.max(0, Math.min(scores[index], goal));
      var resting = index === lineup.restingTeam;
      $scores.append($('<div class="three-team-score"></div>').addClass("team-index-" + index).append(
        $("<span></span>").text(names(team)),
        $('<div class="three-team-score-value"></div>').append(
          $("<strong></strong>").text(scores[index]),
          $('<span class="remaining-label"></span>').text(remaining ? remaining + " left" : "Goal reached")
        ),
        $('<div class="three-team-progress" role="progressbar"></div>')
          .attr({ "aria-valuemin": 0, "aria-valuemax": goal, "aria-valuenow": progress })
          .append($('<div class="three-team-progress-fill"></div>').css("width", (progress / goal * 100) + "%")),
        $('<span class="resting-label"></span>').toggleClass("resting-placeholder", !resting)
          .text(resting && finished ? "Sat out" : "Sitting out")
      ));
    });
    if (!finished) return null;
    var w = ["A", "B", "C"].indexOf(game.winner);
    return game.teams[w] ? names(game.teams[w]) + " wins!" : null;
  }

  function render() {
    var session = TichuPlayers.getLiveSharedSession();
    var game = TichuPlayers.getLiveSharedGame(session);
    if (!game) {
      if (document.body.classList.contains("live-view")) window.location.reload();
      return;
    }
    var threshold = game.winThreshold || 500;
    var rounds = game.rounds || [];
    var threeTeams = game.mode === "threeTeams";
    var scores = rounds.length ? rounds[rounds.length - 1].scores.slice() : [0, 0, 0];
    var banner = threeTeams ? renderThreeTeam(game, scores, threshold) : renderTwoTeam(game, scores, threshold);
    var lineup = TichuPlayers.getRoundLineup(game, rounds.length + 1);

    $("body").addClass("live-view");
    $("#teamAName, #teamBName").prop("readonly", true);
    $("#mode-hint").addClass("hidden");
    $("#round-counter").text(game.winner && threeTeams ? "Final" : "Round " + (rounds.length + 1));
    $("#round-scores").attr("href", "round-scores.html?game=" + encodeURIComponent(game.id));

    var label = "Session \u2014 Game " + TichuPlayers.getSessionGames(game.sessionId).length;
    if (lineup.sittingOut) {
      label += " \u00b7 " + (threeTeams ? names(lineup.sittingOut) + (game.winner ? " sat out" : " sit out") : TichuPlayers.resolveName(lineup.sittingOut, "?") + " sits out");
    }
    $("#session-tag-text").text(label);
    $("#session-tag").removeClass("hidden");

    var dealerId = TichuPlayers.getCurrentRoundDealer(game);
    if (dealerId && !(threeTeams && game.winner)) {
      $("#dealer-tag-text").text("Dealer: " + TichuPlayers.resolveName(dealerId, "?"));
      $("#dealer-tag").removeClass("hidden");
    } else {
      $("#dealer-tag").addClass("hidden");
    }

    var key = game.id + ":" + rounds.length + ":" + banner;
    $("#win-banner-finish").addClass("hidden");
    if (banner && dismissedKey !== key) {
      $("#win-banner-text").text(banner);
      $("#win-banner, #win-banner-close").removeClass("hidden");
    } else {
      $("#win-banner").addClass("hidden");
    }
    $("#win-banner-close").off("click.live").on("click.live", function () { dismissedKey = key; });

    if (!$("#readonly-banner").length) {
      $('<div class="card-panel" id="readonly-banner"></div>')
        .text("Live view \u2014 hosted by another player (read-only)")
        .insertAfter(".info-bar");
    }
  }

  function poll() {
    var cloud = window.TichuCloud;
    if (document.hidden || !cloud || !cloud.sync.refresh || !cloud.getCurrentUser()) return;
    var before = localStorage.getItem("tichuSessions") + localStorage.getItem("tichuGames") + localStorage.getItem("tichuSharedNames");
    cloud.sync.refresh(cloud.getCurrentUser()).then(function () {
      if (before !== localStorage.getItem("tichuSessions") + localStorage.getItem("tichuGames") + localStorage.getItem("tichuSharedNames")) render();
    }).catch(function () {});
  }

  $(function () {
    if (liveGame()) render();
    if (localStorage.getItem("tichuCloudUser")) setInterval(poll, 15000);
  });
})();
