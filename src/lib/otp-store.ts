/**
 * Hybrid OTP store — Firestore-primary with in-memory fallback.
 *
 * Strategy:
 * 1. Try Firestore (works across serverless instances on Vercel)
 * 2. Fallback to in-memory Map (works on single instance / local dev)
 *
 * This ensures OTP works even if Firebase Admin SDK is not configured.
 * On Vercel production, Firestore will be used when credentials are set.
 * On local dev or when Admin SDK is unavailable, in-memory still works.
 */

import { timingSafeEqual } from "crypto";

type OtpEntry = {
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: string;
};

/** OTP expiry: 5 minutes */
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
/** Max verification attempts per OTP */
export const MAX_OTP_ATTEMPTS = 3;
/** Firestore collection name for OTPs */
const OTP_COLLECTION = "otpStore";

// ── In-memory fallback store ──
const memoryStore = new Map<string, OtpEntry>();

// Cleanup expired entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of memoryStore.entries()) {
      if (val.expiresAt < now) memoryStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

function memorySetOtp(phone: string, code: string): void {
  const key = phone.replace(/[\s\-()]/g, "").toLowerCase();
  memoryStore.set(key, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
}

function memoryVerifyOtp(phone: string, code: string): string {
  const key = phone.replace(/[\s\-()]/g, "").toLowerCase();
  const entry = memoryStore.get(key);
  if (!entry) return "not_found";

  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return "expired";
  }

  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    memoryStore.delete(key);
    return "max_attempts";
  }

  const expected = Buffer.from(entry.code, "utf-8");
  const provided = Buffer.from(code, "utf-8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    entry.attempts += 1;
    return "invalid";
  }

  memoryStore.delete(key);
  return "valid";
}

// ── Firestore-backed store ──
async function firestoreSetOtp(phone: string, code: string): Promise<boolean> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return false;

    const docId = phone.replace(/[\s\-()]/g, "").toLowerCase();
    await adminDb.collection(OTP_COLLECTION).doc(docId).set({
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

async function firestoreVerifyOtp(phone: string, code: string): Promise<string | null> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return null;

    const docId = phone.replace(/[\s\-()]/g, "").toLowerCase();
    const docRef = adminDb.collection(OTP_COLLECTION).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) return null;

    const entry = docSnap.data() as OtpEntry;

    if (Date.now() > entry.expiresAt) {
      await docRef.delete();
      return "expired";
    }

    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      await docRef.delete();
      return "max_attempts";
    }

    const expected = Buffer.from(entry.code, "utf-8");
    const provided = Buffer.from(code, "utf-8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      await docRef.update({ attempts: entry.attempts + 1 });
      return "invalid";
    }

    await docRef.delete();
    return "valid";
  } catch {
    return null;
  }
}

// ── Public API (hybrid) ──

/**
 * Store an OTP for a phone number.
 * Tries Firestore first, falls back to in-memory.
 */
export async function setOtp(phone: string, code: string): Promise<void> {
  const firestoreOk = await firestoreSetOtp(phone, code);
  if (!firestoreOk) {
    // Fallback: in-memory (works without Firebase Admin SDK)
    memorySetOtp(phone, code);
  }
}

/**
 * Verify an OTP for a phone number.
 * Tries Firestore first, falls back to in-memory.
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  // Try Firestore first
  const firestoreResult = await firestoreVerifyOtp(phone, code);
  if (firestoreResult !== null) {
    return firestoreResult;
  }

  // Fallback: in-memory
  return memoryVerifyOtp(phone, code);
}
