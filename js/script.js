(function() {
  var data, history, init, nextRound, update;

  data = {};
  history = [];

  $(function() {
    init();

    // punten toekennen
    $('.adding-points .minus').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId === 'A'].currentPoints = data[parentId === 'A'].currentPoints <= -25 ? -25 : data[parentId === 'A'].currentPoints - 5;
      data[parentId !== 'A'].currentPoints = data[parentId !== 'A'].currentPoints >= 125 ? 125 : data[parentId !== 'A'].currentPoints + 5;
      return update();
    });

    $('.adding-points .plus').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId === 'A'].currentPoints = data[parentId === 'A'].currentPoints >= 125 ? 125 : data[parentId === 'A'].currentPoints + 5;
      data[parentId !== 'A'].currentPoints = data[parentId !== 'A'].currentPoints <= -25 ? -25 : data[parentId !== 'A'].currentPoints - 5;
      return update();
    });

    // tichu dropdown
    $('.dropdown-content a').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      data[parentId === 'A'].tichuModText = $(this).text();
      data[parentId === 'A'].tichuMod = parseInt($(this).attr('data-value'));
      return update();
    });

    // double win
    $('.double-win-checkbox').click(function() {
      var parentId = $(this).parents('.card').attr('id');
      var checked = $(this).prop('checked');
      data[parentId === 'A'].doubleWin = checked;
      if (checked) {
        data[parentId !== 'A'].doubleWin = false;
      }
      return update();
    });

    // undo & reset
    $('#undo').click(function() {
      if (history.length) {
        data = history.pop();
      }
      return update();
    });
    $('#btn-next').click(nextRound);
    $('#reset').click(init);

    // team name inputs -> opslaan in localStorage
    $("#teamAName").on("input", function() {
      localStorage.setItem("teamAName", $(this).val());
    });
    $("#teamBName").on("input", function() {
      localStorage.setItem("teamBName", $(this).val());
    });
  });

  init = function() {
    var ref = ['A', 'B'];
    for (var i = 0; i < ref.length; i++) {
      var t = ref[i];
      data[t === 'A'] = {
        points: 0,
        currentPoints: 50,
        tichuMod: 0,
        tichuModText: 'No Tichu',
        doubleWin: false
      };
    }

    // Zet teamnamen vanuit localStorage of defaults
    $("#teamAName").val(localStorage.getItem("teamAName") || "Team A");
    $("#teamBName").val(localStorage.getItem("teamBName") || "Team B");

    return update();
  };

  update = function() {
    var ref = ['A', 'B'];
    for (var i = 0; i < ref.length; i++) {
      var t = ref[i];
      $('#' + t + ' .points').text(data[t === 'A'].points);
      var tempPoints = (data[t === 'A'].doubleWin ? 200 + data[t === 'A'].tichuMod : data[t !== 'A'].doubleWin ? data[t === 'A'].tichuMod : data[t === 'A'].currentPoints + data[t === 'A'].tichuMod);
      $('#' + t + ' .temp-points').text(tempPoints);
      $("a.dropdown-button[data-activates='tichuDropdown" + t + "']").text(data[t === 'A'].tichuModText);
      $('#' + t + ' .double-win-checkbox').prop('checked', data[t === 'A'].doubleWin);
    }
  };

  nextRound = function() {
    history.push($.extend(true, {}, data));
    var ref = ['A', 'B'];
    for (var i = 0; i < ref.length; i++) {
      var t = ref[i];
      data[t === 'A'].points += (data[t === 'A'].doubleWin ? 200 + data[t === 'A'].tichuMod : data[t !== 'A'].doubleWin ? data[t === 'A'].tichuMod : data[t === 'A'].currentPoints + data[t === 'A'].tichuMod);
    }
    for (var j = 0; j < ref.length; j++) {
      var t2 = ref[j];
      data[t2 === 'A'].currentPoints = 50;
      data[t2 === 'A'].tichuMod = 0;
      data[t2 === 'A'].tichuModText = 'No Tichu';
      data[t2 === 'A'].doubleWin = false;
      $("a.dropdown-button[data-activates='tichuDropdown" + t2 + "']").text("No Tichu");
      $('.double-win-checkbox').prop('checked', false);
    }
    return update();
  };

  // touch scroll fix
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

}).call(this);