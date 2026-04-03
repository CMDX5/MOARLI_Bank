import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration — reads from env vars or uses defaults
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBTgQjc1zJvPSAZZ0VDZD0PLZRPFCw9Zlc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "banque-digitale.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "banque-digitale",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "banque-digitale.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1082571970554",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1082571970554:web:41b0f5d74fbc025f73b643",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-JXJ3D2M3K6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let analyticsPromise: Promise<ReturnType<typeof getAnalytics> | null> | null = null;

if (typeof window !== "undefined") {
  analyticsPromise = isSupported()
    .then((supported) => (supported ? getAnalytics(app) : null))
    .catch(() => null);
}

export const firebaseApp = app;
export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);
export const firebaseAnalytics = analyticsPromise;
export const isFirebaseConfigured = true;
export { firebaseConfig };
