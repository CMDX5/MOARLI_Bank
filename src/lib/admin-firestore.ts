import { getApps, initializeApp, cert, getApp } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

let adminDb: Firestore | null = null;
let initAttempted = false;

/**
 * Get Firestore instance via Firebase Admin SDK.
 * Falls back gracefully if not configured.
 */
export async function getAdminFirestore(): Promise<Firestore | null> {
  if (adminDb) return adminDb;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    // Check for credentials
    let credential: { projectId: string; privateKey: string; clientEmail: string } | undefined;

    // 1. Local service account key file
    const localKeyPath = resolve(process.cwd(), "service-account-key.json");
    if (existsSync(localKeyPath)) {
      const keyData = JSON.parse(readFileSync(localKeyPath, "utf-8"));
      credential = cert(keyData);
    }

    // 2. GOOGLE_APPLICATION_CREDENTIALS env var
    if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const envVal = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (envVal.startsWith("{")) {
        credential = cert(JSON.parse(envVal));
      } else if (existsSync(envVal)) {
        const keyData = JSON.parse(readFileSync(envVal, "utf-8"));
        credential = cert(keyData);
      }
    }

    if (!credential) return null;

    if (getApps().length === 0) {
      initializeApp({ credential });
    }

    adminDb = getFirestore(getApp());
    return adminDb;
  } catch (err) {
    console.error("[admin-firestore] Init failed:", err);
    return null;
  }
}
