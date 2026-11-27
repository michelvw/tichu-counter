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
    if ($("#player-name").is("input")) {
      $("#player-name").replaceWith('<button type="button" id="player-name" class="player-name-button" aria-label="Rename player"></button>');
    }
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
    renderLinking();
    $("#stats-content").removeClass("hidden");
  }

  function renderLinking() {
    var L = window.TichuLinking;
    var $section = $("#link-section").addClass("hidden");
    var readOnly = !TichuPlayers.isOwn(player);
    $("#readonly-banner").toggleClass("hidden", !readOnly);
    $("#player-name").prop("disabled", readOnly);
    $("#archive-player, #reset-player-stats").toggleClass("hidden", readOnly);
    if (!L || !L.isSignedIn()) return;

    var me = L.myUid();
    var $status = $("#link-status").text("");
    var $buttons = $("#link-buttons").empty();
    function button(label, handler) {
      $buttons.append($('<button type="button" class="btn-flat"></button>').text(label).on("click", handler));
    }

    if (readOnly) {
      if (player.linkedUid === me) {
        $status.text("Linked to your account.");
        button("Unlink my account", function () {
          L.unlink(player.id, "Unlink your account from " + player.name + "? You will stop seeing this host's games live.");
        });
      }
    } else if (player.linkedUid) {
      $status.text("Linked to " + (player.linkedLabel || "a user account") + ".");
      button("Unlink account", function () { L.unlink(player.id); });
    } else {
      var alreadyMe = TichuPlayers.getPlayers({ ownOnly: true }).some(function (p) { return p.linkedUid === me; });
      if (!alreadyMe) button("This is me", function () { L.thisIsMe(player.id); });
      button("Link to user account", function () { L.invite(player.id); });
    }
    $section.toggleClass("hidden", !$buttons.children().length && !$status.text());
  }

  function startRename() {
    var $name = $("#player-name");
    if ($name.is("input") || !TichuPlayers.isOwn(player)) return;

    var originalName = player.name;
    var $input = $('<input type="text" id="player-name" class="player-name-input">').val(originalName);
    $name.replaceWith($input);
    $input.trigger("focus").select();

    var finished = false;
    function finish(save) {
      if (finished) return;
      finished = true;
      if (!save) {
        render();
        return;
      }
      try {
        player = TichuPlayers.renamePlayer(player.id, $input.val());
        render();
      } catch (err) {
        window.alert(err.message);
        render();
      }
    }

    $input.on("keydown", function (e) {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    $input.on("blur", function () {
      finish(true);
    });
  }

  $("#player-stats-page").on("click", "#player-name", startRename);

  $("#reset-player-stats").on("click", function () {
    if (window.confirm("Reset " + player.name + "'s statistics? Their player profile and future games will be kept.")) {
      TichuPlayers.resetPlayerStatistics(player.id);
      render();
    }
  });

  $("#archive-player").on("click", function () {
    if (window.confirm(player.name + " will be hidden from future sessions but keeps their history. Archive them?")) {
      TichuPlayers.archivePlayer(player.id);
      window.location.href = "players.html";
    }
  });

  render();
})();
