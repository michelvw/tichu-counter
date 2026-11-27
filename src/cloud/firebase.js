import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// The Android app and the PWA share this named Firestore database.
// Never call getFirestore(app) without it: "(default)" is not provisioned.
export const FIRESTORE_DATABASE_ID = "ai-studio-android-tichucou-5efbe124-3da2-4b26-ae84-6332f72d457f";

const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0001461432",
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.authDomain);

let services = null;

// Lazy so builds without a Firebase config never touch Firebase.
export function getServices() {
  if (!isConfigured) throw new Error("Cloud sync is not configured for this build.");
  if (!services) {
    const app = initializeApp(firebaseConfig);
    services = { app, auth: getAuth(app), db: getFirestore(app, FIRESTORE_DATABASE_ID) };
  }
  return services;
}
