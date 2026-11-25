(function () {
  var form = document.getElementById("win-threshold-form");
  var select = document.getElementById("win-threshold");
  var customField = document.getElementById("custom-threshold-field");
  var custom = document.getElementById("custom-win-threshold");
  var status = document.getElementById("threshold-status");
  var presets = [300, 500, 750, 1000];

  function showSavedThreshold() {
    var value = TichuStorage.getWinThreshold();
    select.value = presets.indexOf(value) === -1 ? "custom" : String(value);
    custom.value = select.value === "custom" ? value : "";
    customField.hidden = select.value !== "custom";
  }

  select.addEventListener("change", function () {
    customField.hidden = select.value !== "custom";
    status.textContent = "";
    if (!customField.hidden) custom.focus();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var raw = select.value === "custom" ? custom.value : select.value;
    var value = Number(raw);
    if (!raw || !Number.isSafeInteger(value) || value <= 0) {
      status.textContent = "Enter a positive whole number for the target.";
      custom.focus();
      return;
    }

    var previous = TichuStorage.getWinThreshold();
    if (value === previous) {
      status.textContent = "The target is already " + value + " points.";
      return;
    }
    var game = TichuPlayers.getCurrentGame();
    if (game && game.mode === "threeTeams" && game.winner) {
      status.textContent = "Start the next game or undo the winning round before changing the target.";
      return;
    }
    var active = !!game || TichuStorage.getRoundScores().length > 0 ||
      TichuStorage.getRoundNumber() > 1 || TichuStorage.getPoints("A") !== 0 || TichuStorage.getPoints("B") !== 0;
    if (active && !window.confirm("Change the target during this game? A team may reach the new target immediately.")) {
      showSavedThreshold();
      status.textContent = "Target unchanged.";
      return;
    }

    TichuStorage.setWinThreshold(value);
    if (game && game.mode === "threeTeams") {
      game = TichuPlayers.finishThreeTeamGameIfWon(game, value);
    }
    showSavedThreshold();
    status.textContent = game && game.mode === "threeTeams" && game.winner
      ? "Target saved. The game has a winner."
      : "Target saved: " + value + " points.";
  });

  showSavedThreshold();
})();
