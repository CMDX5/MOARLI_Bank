import { getApps, initializeApp, cert, getApp, type Credential } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

let adminDb: Firestore | null = null;
let initAttempted = false;
let initFailed = false;

/**
 * Get Firestore instance via Firebase Admin SDK.
 *
 * Credential resolution order:
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON env var (recommended for Vercel / serverless)
 *  2. GOOGLE_APPLICATION_CREDENTIALS env var (path or inline JSON)
 *  3. service-account-key.json at project root (local dev only)
 *  4. Application Default Credentials (GCP / Cloud Run)
 */
export async function getAdminFirestore(): Promise<Firestore | null> {
  if (adminDb) return adminDb;

  // If init failed previously AND no new credential source has appeared, don't retry.
  // But if init was never attempted, or failed without credentials, try again.
  const hasCredentials =
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    existsSync(resolve(process.cwd(), "service-account-key.json"));

  if (initAttempted && (initFailed ? !hasCredentials : true)) return null;
  if (initAttempted && !initFailed) return null;

  initAttempted = true;
  initFailed = false;

  try {
    let credential: Credential | undefined;

    // 1. FIREBASE_SERVICE_ACCOUNT_JSON — inline JSON (recommended for Vercel)
    if (!credential && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        const keyData = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        credential = cert(keyData);
        console.log("[admin-firestore] Using FIREBASE_SERVICE_ACCOUNT_JSON");
      } catch (parseErr) {
        console.error("[admin-firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", parseErr);
      }
    }

    // 2. GOOGLE_APPLICATION_CREDENTIALS — path or inline JSON
    if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const envVal = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      try {
        if (envVal.trim().startsWith("{")) {
          // Inline JSON string
          credential = cert(JSON.parse(envVal));
          console.log("[admin-firestore] Using GOOGLE_APPLICATION_CREDENTIALS (inline JSON)");
        } else if (existsSync(envVal)) {
          // File path
          const keyData = JSON.parse(readFileSync(envVal, "utf-8"));
          credential = cert(keyData);
          console.log("[admin-firestore] Using GOOGLE_APPLICATION_CREDENTIALS (file)");
        } else {
          console.warn("[admin-firestore] GOOGLE_APPLICATION_CREDENTIALS path not found:", envVal);
        }
      } catch (parseErr) {
        console.error("[admin-firestore] Failed to load GOOGLE_APPLICATION_CREDENTIALS:", parseErr);
      }
    }

    // 3. Local service account file (local dev fallback)
    if (!credential) {
      const localKeyPath = resolve(process.cwd(), "service-account-key.json");
      if (existsSync(localKeyPath)) {
        try {
          const keyData = JSON.parse(readFileSync(localKeyPath, "utf-8"));
          credential = cert(keyData);
          console.log("[admin-firestore] Using local service-account-key.json");
        } catch (parseErr) {
          console.error("[admin-firestore] Failed to parse service-account-key.json:", parseErr);
        }
      }
    }

    // 4. Application Default Credentials (GCP, Cloud Run, etc.)
    // If no explicit credential is found, let firebase-admin use ADC automatically.
    // initializeApp() with no credential falls back to ADC.

    if (getApps().length === 0) {
      if (credential) {
        initializeApp({ credential });
      } else {
        // ADC fallback — works on GCP/Cloud Run, fails elsewhere with a clear error
        console.warn("[admin-firestore] No explicit credential found — attempting Application Default Credentials (ADC). Set FIREBASE_SERVICE_ACCOUNT_JSON for Vercel.");
        initializeApp();
      }
    }

    adminDb = getFirestore(getApp());
    return adminDb;
  } catch (err) {
    initFailed = true;
    console.error("[admin-firestore] Init failed:", err);
    console.error(
      "[admin-firestore] To fix: set FIREBASE_SERVICE_ACCOUNT_JSON in your environment variables.\n" +
      "  Generate: cat service-account-key.json | jq -c . | tr -d '\\n'\n" +
      "  Then set the output as the FIREBASE_SERVICE_ACCOUNT_JSON env var in Vercel/your host."
    );
    return null;
  }
}
