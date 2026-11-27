import { isConfigured } from "./firebase.js";
import { claimInvite, clearLocal, createInvite, flush, linkSelf, onSignIn, refreshFromCloud, startAutoSync, unlinkPlayer } from "./sync.js";
import {
  completeRedirectSignIn,
  getCurrentUser,
  isGuestMode,
  onAuthChange,
  setGuestMode,
  signInWithGoogle,
  signOut,
} from "./auth.js";

const sync = { onSignIn, flush, clearLocal, refresh: refreshFromCloud };
const linking = { linkSelf, createInvite, claimInvite, unlinkPlayer };

// Entry point for the classic-script bundle (js/cloud.js).
window.TichuCloud = {
  isConfigured,
  sync,
  linking,
  getCurrentUser,
  isGuestMode,
  onAuthChange,
  setGuestMode,
  signInWithGoogle,
  signOut,
};

if (isConfigured && !/welcome\.html$/.test(window.location.pathname) && localStorage.getItem("tichuCloudUser")) {
  startAutoSync((callback) => onAuthChange((user) => {
    if (!user) {
      localStorage.removeItem("tichuCloudUser");
      if (!isGuestMode()) window.location.replace("welcome.html");
      return;
    }
    callback(user);
  }));
}
