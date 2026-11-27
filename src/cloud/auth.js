import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getServices, isConfigured } from "./firebase.js";

const GUEST_KEY = "tichuGuestModeActive";

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

// Never use signInAnonymously(): anonymous auth is not enabled on this backend.
export async function signInWithGoogle() {
  const { auth } = getServices();
  const provider = new GoogleAuthProvider();
  if (isStandalonePwa()) {
    // Popups are unreliable in iOS Home Screen mode.
    await signInWithRedirect(auth, provider);
    return null;
  }
  try {
    return (await signInWithPopup(auth, provider)).user;
  } catch (error) {
    if (error.code === "auth/popup-blocked" || error.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export async function completeRedirectSignIn() {
  if (!isConfigured) return null;
  const result = await getRedirectResult(getServices().auth);
  return result ? result.user : null;
}

export async function signOut() {
  await firebaseSignOut(getServices().auth);
}

export function onAuthChange(callback) {
  if (!isConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getServices().auth, callback);
}

export function getCurrentUser() {
  return isConfigured ? getServices().auth.currentUser : null;
}

export function isGuestMode() {
  return localStorage.getItem(GUEST_KEY) === "true";
}

export function setGuestMode(active) {
  localStorage.setItem(GUEST_KEY, active ? "true" : "false");
}
