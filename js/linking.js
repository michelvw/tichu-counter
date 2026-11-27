(function () {
  "use strict";

  function myUid() {
    return localStorage.getItem("tichuCloudUser") || null;
  }

  function isSignedIn() {
    return !!myUid();
  }

  function badge(player) {
    var me = myUid();
    if (!me) return null;
    if (player.linkedUid === me || (player.ownerUid && player.ownerUid !== me)) return "You";
    if (player.linkedUid) return "Linked";
    return "Guest";
  }

  function isReadOnly(record) {
    var me = myUid();
    return !!(me && record && record.ownerUid && record.ownerUid !== me);
  }

  function getUser() {
    return new Promise(function (resolve, reject) {
      var cloud = window.TichuCloud;
      if (!cloud || !cloud.isConfigured) return reject(new Error("Cloud sync isn't available."));
      var current = cloud.getCurrentUser();
      if (current) return resolve(current);
      var timer = setTimeout(function () { reject(new Error("Not signed in.")); }, 8000);
      cloud.onAuthChange(function (user) {
        if (user) { clearTimeout(timer); resolve(user); }
      });
    });
  }

  function run(task, successMessage) {
    return getUser().then(task).then(function (result) {
      if (successMessage) window.alert(typeof successMessage === "function" ? successMessage(result) : successMessage);
      window.location.reload();
    }).catch(function (err) {
      window.alert((err && err.message) || "Something went wrong.");
    });
  }

  function requireSignIn() {
    if (isSignedIn()) return true;
    if (window.confirm("Sign in with Google to link players. Go to Settings to sign in?")) {
      window.location.href = "settings.html";
    }
    return false;
  }

  function thisIsMe(playerId) {
    if (!requireSignIn()) return;
    run(function (user) { return window.TichuCloud.linking.linkSelf(user, playerId); });
  }

  function invite(playerId) {
    if (!requireSignIn()) return;
    getUser().then(function (user) {
      return window.TichuCloud.linking.createInvite(user, playerId);
    }).then(function (result) {
      window.prompt("Share this invite code (valid for 7 days, single use):", result.code);
    }).catch(function (err) {
      window.alert((err && err.message) || "Could not create the invite.");
    });
  }

  function claim() {
    if (!requireSignIn()) return;
    var code = window.prompt("Enter the invite code:");
    if (!code) return;
    run(function (user) { return window.TichuCloud.linking.claimInvite(user, code); },
      function (name) { return "Linked! You can now follow " + name + " live."; });
  }

  function unlink(playerId, message) {
    if (!window.confirm(message || "Unlink this player from the user account?")) return;
    run(function (user) { return window.TichuCloud.linking.unlinkPlayer(user, playerId); });
  }

  window.TichuLinking = {
    isSignedIn: isSignedIn,
    myUid: myUid,
    badge: badge,
    isReadOnly: isReadOnly,
    thisIsMe: thisIsMe,
    invite: invite,
    claim: claim,
    unlink: unlink
  };
})();
