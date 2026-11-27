(function () {
  var cloud = window.TichuCloud;
  var statusEl = document.getElementById("account-status");
  var signInButton = document.getElementById("account-sign-in");
  var signOutButton = document.getElementById("account-sign-out");
  var message = document.getElementById("account-message");

  function show(user) {
    if (user) {
      localStorage.setItem("tichuCloudUser", user.uid);
      localStorage.setItem("tichuGuestModeActive", "false");
    }
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
      if (user) show(user);
    }).catch(function (error) {
      message.textContent = "Sign-in failed: " + (error && error.message || error);
    });
  });

  signOutButton.addEventListener("click", function () {
    cloud.signOut().then(function () {
      localStorage.removeItem("tichuCloudUser");
      localStorage.setItem("tichuGuestModeActive", "true");
      show(null);
    }).catch(function (error) {
      message.textContent = "Sign-out failed: " + (error && error.message || error);
    });
  });

  cloud.onAuthChange(function (user) {
    if (!user) localStorage.removeItem("tichuCloudUser");
    show(user);
  });
})();
