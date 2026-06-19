import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration — reads from environment variables (REQUIRED)
// Set these in .env.local for development or .env.production for deployment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

// Only initialize Firebase when required env vars are present.
// This prevents build failures in CI environments where env vars are not set.
// Firebase client SDK requires a valid API key to initialize Auth/Firestore
// services — calling getAuth() or getFirestore() without one throws immediately.
const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

const app = isConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

let analyticsPromise: Promise<ReturnType<typeof getAnalytics> | null> | null = null;

// BUG FIX: Only initialize Analytics when a measurementId is configured AND the
// environment supports it. Previously, analytics was initialized even without a
// measurementId, causing repeated "TypeError: Failed to fetch" errors in the
// console on every page load (the SDK tried to reach Google Analytics endpoints
// that reject requests without a valid measurement id).
if (typeof window !== "undefined" && app && firebaseConfig.measurementId) {
  analyticsPromise = isSupported()
    .then((supported) => (supported ? getAnalytics(app) : null))
    .catch(() => null);
}

export const firebaseApp = app;
// When Firebase is not configured (CI/build), these are null at runtime.
// Type assertions (!) preserve backward compatibility — consuming code already
// expects non-null and handles errors via try/catch or React error boundaries.
// In production, these are always properly initialized.
export const firebaseAuth = app ? getAuth(app) : null!;
export const firebaseDb = app ? getFirestore(app) : null!;
export const firebaseAnalytics = analyticsPromise;
export const isFirebaseConfigured = isConfigured;
export { firebaseConfig };
