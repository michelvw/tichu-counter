(function () {
  var cloud = window.TichuCloud;
  var signInButton = document.getElementById("sign-in");
  var status = document.getElementById("welcome-status");

  function enter(user) {
    localStorage.setItem("tichuGuestModeActive", "false");
    localStorage.setItem("tichuCloudUser", user.uid);
    window.location.replace("index.html");
  }

  document.getElementById("continue-guest").addEventListener("click", function () {
    localStorage.setItem("tichuGuestModeActive", "true");
    localStorage.removeItem("tichuCloudUser");
    window.location.replace("index.html");
  });

  if (!cloud || !cloud.isConfigured) {
    signInButton.disabled = true;
    status.textContent = "Google sign-in isn't available in this build. You can continue as a guest.";
    return;
  }

  signInButton.addEventListener("click", function () {
    status.textContent = "";
    signInButton.disabled = true;
    cloud.signInWithGoogle().then(function (user) {
      if (user) enter(user);
    }).catch(function (error) {
      signInButton.disabled = false;
      status.textContent = error && error.code === "auth/popup-closed-by-user"
        ? "Sign-in was cancelled." : "Sign-in failed: " + (error && error.message || error);
    });
  });

  // Covers sign-ins that complete without the popup promise resolving.
  cloud.onAuthChange(function (user) {
    if (user) enter(user);
  });

  // Returning from a redirect-based sign-in (iOS Home Screen mode).
  cloud.completeRedirectSignIn().then(function (user) {
    if (user) enter(user);
  }).catch(function (error) {
    status.textContent = "Sign-in failed: " + (error && error.message || error);
  });
})();
