(function() {
  var data, history, init, nextRound, update;
  var roundNumber, winThreshold;
  // Session mode: set in init() when this scoreboard is being used to
  // play out a game that belongs to a session (see sessions.js /
  // players-storage.js), as opposed to a plain untracked Quick Game.
  var sessionMode = false;
  var currentGame = null;

  data = {};
  history = [];

  $(function() {
    init();

    // Assign points
    $('.adding-points .minus').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId].currentPoints = data[parentId].currentPoints <= -25 ? -25 : data[parentId].currentPoints - 5;
      data[parentId === 'A' ? 'B' : 'A'].currentPoints = data[parentId === 'A' ? 'B' : 'A'].currentPoints >= 125 ? 125 : data[parentId === 'A' ? 'B' : 'A'].currentPoints + 5;
      return update();
    });

    $('.adding-points .plus').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId].currentPoints = data[parentId].currentPoints >= 125 ? 125 : data[parentId].currentPoints + 5;
      data[parentId === 'A' ? 'B' : 'A'].currentPoints = data[parentId === 'A' ? 'B' : 'A'].currentPoints <= -25 ? -25 : data[parentId === 'A' ? 'B' : 'A'].currentPoints - 5;
      return update();
    });

    // Tichu dropdown
    $('.tichu-modifier .dropdown-content a').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId].tichuModText = $(this).text();
      data[parentId].tichuMod = parseInt($(this).attr('data-value'));
      return update();
    });

    // Double win
    $('.double-win-checkbox').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      var checked = $(this).prop('checked');
      data[parentId].doubleWin = checked;
      if (checked) {
        data[parentId === 'A' ? 'B' : 'A'].doubleWin = false;
      }
      return update();
    });

    // Undo & reset
    $('#undo').click(function() {
      if (history.length) {
        var prev = history.pop();
        data = prev.data;
        roundNumber = prev.roundNumber;
        TichuStorage.setRoundNumber(roundNumber);
        $('#round-counter').text('Round ' + roundNumber);
        $('#win-banner').addClass('hidden');
        updateSessionRoundDisplay();
      }
      return update();
    });
    $('#btn-next').click(nextRound);
   
    $('#reset').click(function() {
      if (sessionMode && !window.confirm('This session\'s game is still in progress. Reset the scoreboard anyway?')) {
        return;
      }

      // Clear the data object
      init();

      TichuStorage.resetGame();

      // Update the data object to reflect the reset totals
      data['A'].points = 0;
      data['B'].points = 0;
      // Reset points displayed on the game page
      $('#A .points').text(0);
      $('#B .points').text(0);
      console.log("Totals reset to 0.");

      // Reset round counter and clear any win banner
      history = [];
      roundNumber = 1;
      $('#round-counter').text('Round 1');
      $('#win-banner').addClass('hidden');
      if (!sessionMode) {
        var dismissed = localStorage.getItem('tichuModeHintDismissed') === 'true';
        $('#mode-hint').toggleClass('hidden', dismissed);
      }

      //clear the scores table on the round-scores.html page if it's open
      const tableBody = document.querySelector("#round-scores tbody");
      if (tableBody) {
        tableBody.innerHTML = ""; // Clear the table rows
      }

      // Update the UI to reflect the reset totals
      update();
    });

    // Win threshold panel: open/close on button click, close on outside click
    $('#win-threshold-button').click(function(e) {
      e.preventDefault();
      $('#winThresholdPanel').toggleClass('hidden');
    });
    $(document).click(function(e) {
      if (!$(e.target).closest('#winThresholdPanel, #win-threshold-button').length) {
        $('#winThresholdPanel').addClass('hidden');
      }
    });

    // Win threshold: preset options in the panel
    $('.win-threshold-option').click(function(e) {
      e.preventDefault();
      var value = parseInt($(this).attr('data-value'));
      winThreshold = value;
      TichuStorage.setWinThreshold(winThreshold);
      $('#win-threshold-button').text('Win: ' + winThreshold);
      $('#customWinThreshold').val('');
      $('#winThresholdPanel').addClass('hidden');
    });

    // Win threshold: custom value field at the bottom of the panel
    $('#customWinThreshold').on('change', function() {
      var value = parseInt($(this).val());
      if (!isNaN(value) && value > 0) {
        winThreshold = value;
        TichuStorage.setWinThreshold(winThreshold);
        $('#win-threshold-button').text('Win: ' + winThreshold);
      }
      $('#winThresholdPanel').addClass('hidden');
    });
    // Prevent a click inside the panel (e.g. on the input) from
    // bubbling up to the document handler above and closing it early.
    $('#winThresholdPanel').click(function(e) {
      e.stopPropagation();
    });

    // Dismiss the win banner
    $('#win-banner-close').click(function(e) {
      e.preventDefault();
      $('#win-banner').addClass('hidden');
    });

    // Dismiss the "start a session?" nudge -- once dismissed it won't
    // reappear (it's a one-time pointer toward Sessions, not a nag).
    $('#mode-hint-close').click(function(e) {
      e.preventDefault();
      localStorage.setItem('tichuModeHintDismissed', 'true');
      $('#mode-hint').addClass('hidden');
    });

    // Pause the session right from the scoreboard -- e.g. closing the
    // app for the night with a game still in progress. Pausing doesn't
    // touch the game/round data itself, so it's exactly where it was
    // left when the session is resumed later.
    $('#session-pause-link').click(function(e) {
      e.preventDefault();
      if (!sessionMode || !currentGame) return;
      if (window.confirm('Pause this session? You can resume it anytime from Sessions.')) {
        try {
          TichuPlayers.pauseSession(currentGame.sessionId);
        } catch (err) {
          // Already paused (e.g. reached here via the back button after
          // pausing elsewhere) -- nothing more to do, just head over.
        }
        window.location.href = 'sessions.html';
      }
    });

    // Finish the current session game (session mode only): whichever
    // team has more points right now is recorded as the winner, then
    // the next game in the same session starts automatically -- the
    // person stays on the scoreboard and only goes to Sessions when
    // they actively choose to (pause/end there).
    $('#win-banner-finish').click(function(e) {
      e.preventDefault();
      if (!sessionMode || !currentGame) return;
      var winner = data['A'].points === data['B'].points ? null :
        (data['A'].points > data['B'].points ? 'A' : 'B');
      var sessionId = currentGame.sessionId;
      TichuPlayers.finishGame(currentGame.id, winner, { teamA: data['A'].points, teamB: data['B'].points });
      $('#win-banner').addClass('hidden');

      var session = TichuPlayers.getSession(sessionId);
      if (session && session.status === 'active') {
        var nextLineup = TichuPlayers.previewLineupForSession(sessionId);
        var nextGame = TichuPlayers.startNewGameInSession(sessionId, nextLineup);
        var lineup = TichuPlayers.getRoundLineup(nextGame, 1);
        TichuStorage.resetGame();
        TichuStorage.setTeamName('A', TichuPlayers.teamNameString(lineup.teamA));
        TichuStorage.setTeamName('B', TichuPlayers.teamNameString(lineup.teamB));
        history = [];
        init();
        if (typeof M !== 'undefined' && M.toast) {
          M.toast({ html: 'Game finished \u2014 next game started', displayLength: 2500 });
        }
      } else {
        // Session got paused/ended elsewhere in the meantime -- nothing
        // to continue into, so head back to Sessions.
        window.location.href = 'sessions.html';
      }
    });

    // Team name inputs -> save via TichuStorage
    $("#teamAName").on("input", function() {
      TichuStorage.setTeamName("A", $(this).val());
    });
    $("#teamBName").on("input", function() {
      TichuStorage.setTeamName("B", $(this).val());
    });
  });

  init = function() {
  var ref = ['A', 'B'];
  for (var i = 0; i < ref.length; i++) {
    var t = ref[i];
    data[t] = {
      points: TichuStorage.getPoints(t), // Restore points from localStorage
      currentPoints: 50,
      tichuMod: 0,
      tichuModText: 'No Tichu',
      doubleWin: false
    };
  }

  // Set team names from localStorage or defaults
  $("#teamAName").val(TichuStorage.getTeamName("A"));
  $("#teamBName").val(TichuStorage.getTeamName("B"));

  // Restore round number and win threshold from localStorage
  roundNumber = TichuStorage.getRoundNumber();
  $('#round-counter').text('Round ' + roundNumber);

  winThreshold = TichuStorage.getWinThreshold();
  $('#win-threshold-button').text('Win: ' + winThreshold);

  // Session mode: if there's a game in progress for a session, this
  // scoreboard is playing it out. Team names already came from
  // TichuStorage above (sessions.js sets them before redirecting here),
  // so just lock them against editing -- renaming here wouldn't rename
  // the underlying player -- and surface the session tag in the info bar.
  sessionMode = false;
  currentGame = null;
  if (typeof TichuPlayers !== 'undefined') {
    currentGame = TichuPlayers.getCurrentGame();
  }
  if (currentGame) {
    sessionMode = true;
    $('#teamAName, #teamBName').prop('readonly', true);
    $('#mode-hint').addClass('hidden');
    updateSessionRoundDisplay();
  } else {
    $('#session-tag').addClass('hidden');
    $('#teamAName, #teamBName').prop('readonly', false);
    // A lightweight, dismissible nudge toward Sessions -- shown only at
    // the start of a fresh, untouched board (so it doesn't nag once
    // someone's mid-game) and only until the person dismisses it once.
    var freshBoard = roundNumber === 1 && TichuStorage.getRoundScores().length === 0;
    var dismissed = localStorage.getItem('tichuModeHintDismissed') === 'true';
    $('#mode-hint').toggleClass('hidden', !(freshBoard && !dismissed));
  }

  return update();
};

  // Session mode only: recompute who's actually playing this round and
  // reflect it in Team B's name + the info-bar session tag. For a
  // fixed-team (4-player) game this is the same every round; for a
  // rotation (5-player) game it changes as the pool rotates who sits out.
  function updateSessionRoundDisplay() {
    if (!sessionMode || !currentGame) return;
    var lineup = TichuPlayers.getRoundLineup(currentGame, roundNumber);
    var teamAName = TichuPlayers.teamNameString(lineup.teamA);
    var teamBName = TichuPlayers.teamNameString(lineup.teamB);
    $('#teamAName').val(teamAName);
    $('#teamBName').val(teamBName);
    TichuStorage.setTeamName('A', teamAName);
    TichuStorage.setTeamName('B', teamBName);

    var session = TichuPlayers.getSession(currentGame.sessionId);
    var gameCount = TichuPlayers.getSessionGames(currentGame.sessionId).length;
    var label = (session && session.name ? session.name : 'Session') + ' \u2014 Game ' + gameCount;
    if (lineup.sittingOut) {
      var sittingOutPlayer = TichuPlayers.getPlayer(lineup.sittingOut);
      label += ' \u00b7 ' + (sittingOutPlayer ? sittingOutPlayer.name : '?') + ' sits out';
    }
    $('#session-tag-text').text(label);
    $('#session-tag').removeClass('hidden');
  }

  update = function() {
    var ref = ['A', 'B'];
    for (var i = 0; i < ref.length; i++) {
      var t = ref[i];
      $('#' + t + ' .points').text(data[t].points);
      var tempPoints = (data[t].doubleWin ? 200 + data[t].tichuMod : 
                        data[ref[1 - i]].doubleWin ? data[t].tichuMod : 
                        data[t].currentPoints + data[t].tichuMod);
      $('#' + t + ' .temp-points').text(tempPoints);
      $("a.dropdown-button[data-activates='tichuDropdown" + t + "']").text(data[t].tichuModText);
      $('#' + t + ' .double-win-checkbox').prop('checked', data[t].doubleWin);
    }
  };

  nextRound = function() {
    history.push({ data: $.extend(true, {}, data), roundNumber: roundNumber });
    let ref = ['A', 'B'];

    // Remember pre-round totals so we can tell if this round is what
    // pushed a team over the win threshold (rather than re-announcing it
    // every subsequent round if play continues).
    let prevPoints = { A: data['A'].points, B: data['B'].points };

    // Update totals for each team first
    for (let i = 0; i < ref.length; i++) {
      let t = ref[i];
      data[t].points += (data[t].doubleWin ? 200 + data[t].tichuMod : 
                         data[ref[1 - i]].doubleWin ? data[t].tichuMod : 
                         data[t].currentPoints + data[t].tichuMod);
    }

    // Array to store scores for each round
    let roundScores = TichuStorage.getRoundScores();

    // Get updated scores and Tichu status
    const teamAScore = data['A'].points;
    const teamBScore = data['B'].points;

    const teamATichu = (data['A'].doubleWin ? "⇉ " : "") + 
                       (data['A'].tichuMod === 200 ? "GT" : 
                        data['A'].tichuMod === 100 ? "T" : 
                        data['A'].tichuMod === -200 ? "<s>GT</s>" : 
                        data['A'].tichuMod === -100 ? "<s>T</s>" : "");

    const teamBTichu = (data['B'].doubleWin ? "⇉ " : "") + 
                       (data['B'].tichuMod === 200 ? "GT" : 
                        data['B'].tichuMod === 100 ? "T" : 
                        data['B'].tichuMod === -200 ? "<s>GT</s>" : 
                        data['B'].tichuMod === -100 ? "<s>T</s>" : "");

    // Save scores and Tichu status for the current round
    roundScores.push({ 
      teamA: teamAScore, 
      teamB: teamBScore, 
      teamATichu: teamATichu, 
      teamBTichu: teamBTichu 
    });

    console.log("Round scores saved:", roundScores);

    // Save to localStorage
    TichuStorage.setRoundScores(roundScores);

    // Session mode: also attach this round to the session's game record
    // so it survives independently of TichuStorage's single-game slot.
    if (sessionMode && currentGame) {
      var roundLineup = TichuPlayers.getRoundLineup(currentGame, roundNumber);
      TichuPlayers.recordRound(currentGame.id, {
        teamAPoints: teamAScore,
        teamBPoints: teamBScore,
        teamATichuMod: data['A'].tichuMod,
        teamBTichuMod: data['B'].tichuMod,
        teamADoubleWin: data['A'].doubleWin,
        teamBDoubleWin: data['B'].doubleWin,
        sittingOutPlayerId: roundLineup.sittingOut,
      });
    }

    // Save updated totals to localStorage
    TichuStorage.setPoints('A', data['A'].points);
    TichuStorage.setPoints('B', data['B'].points);
    console.log("Updated totals saved to localStorage:", data['A'].points, data['B'].points);

    // Advance the round counter
    roundNumber++;
    TichuStorage.setRoundNumber(roundNumber);
    $('#round-counter').text('Round ' + roundNumber);
    updateSessionRoundDisplay();
    // The "start a session?" nudge only makes sense on an untouched
    // board; once a round's been played there's no more "early stage"
    // to nudge at.
    $('#mode-hint').addClass('hidden');

    // Announce any team that just crossed the win threshold this round
    const winners = ref.filter(function(t) {
      return prevPoints[t] < winThreshold && data[t].points >= winThreshold;
    });
    if (winners.length) {
      const names = winners.map(function(t) {
        return $('#team' + t + 'Name').val() || ('Team ' + t);
      });
      const verb = names.length > 1 ? 'have' : 'has';
      $('#win-banner-text').text(names.join(' & ') + ' ' + verb + ' reached ' + winThreshold + ' points! \uD83C\uDF89');
      $('#win-banner').removeClass('hidden');
      $('#win-banner-finish').toggleClass('hidden', !sessionMode);
    }

    // Reset temporary points for the next round
    $(".temp-points").text("0");

    // Reset other values for the next round
    for (let j = 0; j < ref.length; j++) {
      let t2 = ref[j];
      data[t2].currentPoints = 50;
      data[t2].tichuMod = 0;
      data[t2].tichuModText = 'No Tichu';
      data[t2].doubleWin = false;
      $("a.dropdown-button[data-activates='tichuDropdown" + t2 + "']").text("No Tichu");
      $('.double-win-checkbox').prop('checked', false);
    }

    return update();
  };

  // Touch scroll fix
  $(function() {
    var initialY = null;
    var previousY = null;
    $(document).on('touchstart', function(e) {
      previousY = initialY = e.originalEvent.touches[0].clientY;
      if ($(document).scrollTop() <= 0) {
        return $(document).on("touchmove", blockScroll);
      }
    });
    function blockScroll(e) {
      if (previousY && previousY < e.originalEvent.touches[0].clientY) {
        e.preventDefault();
      } else if (initialY >= e.originalEvent.touches[0].clientY) {
        $(document).off("touchmove");
      }
      previousY = e.originalEvent.touches[0].clientY;
    }
    $(document).on("touchend", function() {
      return $(document).off("touchmove");
    });
  });

  // Save scores to localStorage before navigating to round-scores.html
  $('#btn-round-scores').click(function() {
    TichuStorage.setPoints('A', data['A'].points);
    TichuStorage.setPoints('B', data['B'].points);
    console.log("Scores saved to localStorage:", data['A'].points, data['B'].points);
  });
}).call(this);
