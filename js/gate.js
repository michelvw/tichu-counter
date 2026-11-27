/**
 * Start-screen gate. Pages are only shown to guests (tichuGuestModeActive)
 * or users who signed in with Google (tichuCloudUser marker, kept in sync
 * by the cloud module); everyone else is sent to welcome.html.
 */
(function () {
  var guest = false, signedIn = false;
  try {
    guest = localStorage.getItem("tichuGuestModeActive") === "true";
    signedIn = !!localStorage.getItem("tichuCloudUser");
  } catch (e) {
    return;
  }
  // Automated test browsers (Puppeteer) go straight to the app.
  if (navigator.webdriver) return;
  if (!guest && !signedIn) window.location.replace("welcome.html");
})();
