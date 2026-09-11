(function () {
  "use strict";

  function renderRoster() {
    var active = TichuPlayers.getPlayers({ activeOnly: true });
    var $active = $("#active-players-list").empty();
    if (!active.length) {
      $active.append('<li class="collection-item grey-text">No players yet — add your first one below.</li>');
    }
    active.forEach(function (p) {
      var $li = $('<li class="collection-item"></li>');
      var $actions = $('<span class="secondary-content action-buttons"></span>');
      var $stats = $('<a class="player-row-link" title="View statistics"></a>')
        .attr("href", "player-stats.html?id=" + encodeURIComponent(p.id));
      $stats.append($('<span class="player-row-name"></span>').text(p.name));
      var $rename = $('<button type="button" class="icon-action" title="Rename" aria-label="Rename"></button>');
      $rename.append('<i class="material-icons">edit</i>');
      $rename.on("click", function (e) {
        e.preventDefault();
        var name = window.prompt("Rename player", p.name);
        if (name && name.trim()) {
          TichuPlayers.renamePlayer(p.id, name.trim());
          renderRoster();
        }
      });
      var $archive = $('<button type="button" class="icon-action" title="Archive" aria-label="Archive"></button>');
      $archive.append('<i class="material-icons">archive</i>');
      $archive.on("click", function (e) {
        e.preventDefault();
        if (window.confirm(p.name + ' will be hidden from future sessions but keeps their history. Archive them?')) {
          TichuPlayers.archivePlayer(p.id);
          renderRoster();
        }
      });
      $li.append($stats).append($actions);
      $active.append($li);
    });

    var archived = TichuPlayers.getPlayers().filter(function (p) { return !p.active; });
    var $archived = $("#archived-players-list").empty();
    archived.forEach(function (p) {
      var $li = $('<li class="collection-item"></li>');
      $li.append($('<span class="grey-text"></span>').text(p.name));
      var $unarchive = $('<a href="#" class="secondary-content" title="Restore">Restore</a>');
      $unarchive.on("click", function (e) {
        e.preventDefault();
        TichuPlayers.unarchivePlayer(p.id);
        renderRoster();
      });
      $li.append($unarchive);
      $archived.append($li);
    });
    $("#toggle-archived").text(archived.length ? "Show archived players (" + archived.length + ")" : "No archived players");
  }

  $("#add-player-btn").on("click", function (e) {
    e.preventDefault();
    var $input = $("#new-player-name");
    var name = $input.val();
    try {
      TichuPlayers.addPlayer(name);
      $input.val("");
      renderRoster();
    } catch (err) {
      window.alert(err.message);
    }
  });
  $("#new-player-name").on("keydown", function (e) {
    if (e.key === "Enter") $("#add-player-btn").click();
  });

  $("#toggle-archived").on("click", function (e) {
    e.preventDefault();
    $("#archived-players-list").toggleClass("hidden");
  });

  renderRoster();
})();
