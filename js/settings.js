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

  var backupStatus = document.getElementById("backup-status");
  var importText = document.getElementById("import-text");
  var importFile = document.getElementById("import-file");
  var importConfirm = document.getElementById("import-confirm");
  var pending = null;

  document.getElementById("export-backup").addEventListener("click", function () {
    var blob = new Blob([TichuBackup.exportJSON()], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tichu-counter-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    backupStatus.textContent = "Backup exported.";
  });

  function preview(text) {
    pending = null;
    importConfirm.hidden = true;
    try {
      pending = TichuBackup.parse(text);
    } catch (error) {
      backupStatus.textContent = error.message;
      return;
    }
    backupStatus.textContent = "";
    document.getElementById("import-summary").textContent = TichuBackup.summarize(pending);
    importConfirm.hidden = false;
  }

  importFile.addEventListener("change", function () {
    var file = importFile.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { preview(String(reader.result)); };
    reader.onerror = function () { backupStatus.textContent = "Could not read the file."; };
    reader.readAsText(file);
  });

  document.getElementById("import-preview").addEventListener("click", function () {
    if (!importText.value.trim()) {
      backupStatus.textContent = "Select a file or paste JSON first.";
      return;
    }
    preview(importText.value);
  });

  document.getElementById("import-apply").addEventListener("click", function () {
    if (!pending) return;
    if (!window.confirm("Replace all data on this device with the imported data? This can't be undone.")) return;
    TichuBackup.applyImport(pending);
    pending = null;
    importConfirm.hidden = true;
    importFile.value = "";
    importText.value = "";
    showSavedThreshold();
    backupStatus.textContent = "Import complete.";
  });
})();
