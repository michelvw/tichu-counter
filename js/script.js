(function() {
  var data, history, init, nextRound, update;

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
    $('.dropdown-content a').click(function() {
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
        data = history.pop();
      }
      return update();
    });
    $('#btn-next').click(nextRound);
   
    $('#reset').click(function() {
      // Clear the data object
      init();

      // Clear the roundScores array in localStorage
      localStorage.removeItem("roundScores");
      console.log("Round scores reset.");

      // Reset totals in localStorage
      localStorage.setItem("A_points", 0);
      localStorage.setItem("B_points", 0);
      // Update the data object to reflect the reset totals
      data['A'].points = 0;
      data['B'].points = 0;
      // Reset points displayed on the game page
      $('#A .points').text(0);
      $('#B .points').text(0);
      console.log("Totals reset to 0.");

      //clear the scores table on the round-scores.html page if it's open
      const tableBody = document.querySelector("#round-scores tbody");
      if (tableBody) {
        tableBody.innerHTML = ""; // Clear the table rows
      }

      // Update the UI to reflect the reset totals
      update();
    });

    // Team name inputs -> save in localStorage
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
    data[t] = {
      points: parseInt(localStorage.getItem(`${t}_points`)) || 0, // Restore points from localStorage
      currentPoints: 50,
      tichuMod: 0,
      tichuModText: 'No Tichu',
      doubleWin: false
    };
  }

  // Set team names from localStorage or defaults
  $("#teamAName").val(localStorage.getItem("teamAName") || "Team A");
  $("#teamBName").val(localStorage.getItem("teamBName") || "Team B");

  return update();
};

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
    history.push($.extend(true, {}, data));
    let ref = ['A', 'B'];

    // Update totals for each team first
    for (let i = 0; i < ref.length; i++) {
      let t = ref[i];
      data[t].points += (data[t].doubleWin ? 200 + data[t].tichuMod : 
                         data[ref[1 - i]].doubleWin ? data[t].tichuMod : 
                         data[t].currentPoints + data[t].tichuMod);
    }

    // Array to store scores for each round
    let roundScores = JSON.parse(localStorage.getItem("roundScores")) || [];

    // Get updated scores and Tichu status
    const teamAScore = data['A'].points;
    const teamBScore = data['B'].points;

    const teamATichu = data['A'].tichuMod === 200 ? "GT" : data['A'].tichuMod === 100 ? "T" : 
                       data['A'].tichuMod === -200 ? "<s>GT</s>" : data['A'].tichuMod === -100 ? "<s>T</s>" : "";
    const teamBTichu = data['B'].tichuMod === 200 ? "GT" : data['B'].tichuMod === 100 ? "T" : 
                       data['B'].tichuMod === -200 ? "<s>GT</s>" : data['B'].tichuMod === -100 ? "<s>T</s>" : "";

    // Save scores and Tichu status for the current round
    roundScores.push({ 
      teamA: teamAScore, 
      teamB: teamBScore, 
      teamATichu: teamATichu, 
      teamBTichu: teamBTichu 
    });

    console.log("Round scores saved:", roundScores);

    // Save to localStorage
    localStorage.setItem("roundScores", JSON.stringify(roundScores));

    // Save updated totals to localStorage
    localStorage.setItem("A_points", data['A'].points);
    localStorage.setItem("B_points", data['B'].points);
    console.log("Updated totals saved to localStorage:", data['A'].points, data['B'].points);

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
    localStorage.setItem("A_points", data['A'].points);
    localStorage.setItem("B_points", data['B'].points);
    console.log("Scores saved to localStorage:", data['A'].points, data['B'].points);
  });
}).call(this);