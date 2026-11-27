(function () {
  var cloud = window.TichuCloud;
  var statusEl = document.getElementById("account-status");
  var signInButton = document.getElementById("account-sign-in");
  var signOutButton = document.getElementById("account-sign-out");
  var message = document.getElementById("account-message");

  function show(user) {
    statusEl.textContent = user
      ? "Signed in as " + (user.displayName || user.email || "your Google account") + "."
      : "You're using the app as a guest. Data stays on this device.";
    signInButton.hidden = !!user;
    signOutButton.hidden = !user;
  }

  if (!cloud || !cloud.isConfigured) {
    statusEl.textContent = "You're using the app as a guest. Google sign-in isn't available in this build.";
    return;
  }

  signInButton.addEventListener("click", function () {
    message.textContent = "";
    cloud.signInWithGoogle().then(function (user) {
      if (!user) return;
      message.textContent = "Syncing your data...";
      return cloud.sync.onSignIn(user).then(function () {
        localStorage.setItem("tichuCloudUser", user.uid);
        localStorage.setItem("tichuGuestModeActive", "false");
        window.location.reload();
      });
    }).catch(function (error) {
      message.textContent = "Sign-in failed: " + (error && error.message || error);
    });
  });

  signOutButton.addEventListener("click", function () {
    message.textContent = "Saving changes...";
    cloud.sync.flush().then(function () {
      if (localStorage.getItem("tichuSyncDirty") && !window.confirm("Some changes could not be saved to the cloud and will be lost. Sign out anyway?")) {
        message.textContent = "";
        return;
      }
      return cloud.signOut().then(function () {
        cloud.sync.clearLocal();
        localStorage.removeItem("tichuCloudUser");
        localStorage.setItem("tichuGuestModeActive", "false");
        window.location.replace("welcome.html");
      });
    }).catch(function (error) {
      message.textContent = "Sign-out failed: " + (error && error.message || error);
    });
  });

  cloud.onAuthChange(function (user) {
    show(user);
  });
})();
