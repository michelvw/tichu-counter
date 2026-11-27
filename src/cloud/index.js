import { isConfigured } from "./firebase.js";
import {
  completeRedirectSignIn,
  getCurrentUser,
  isGuestMode,
  onAuthChange,
  setGuestMode,
  signInWithGoogle,
  signOut,
} from "./auth.js";

// Entry point for the classic-script bundle (js/cloud.js).
window.TichuCloud = {
  isConfigured,
  completeRedirectSignIn,
  getCurrentUser,
  isGuestMode,
  onAuthChange,
  setGuestMode,
  signInWithGoogle,
  signOut,
};
