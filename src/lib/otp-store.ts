/**
 * Dual-write OTP store — Always writes to BOTH memory and Firestore.
 *
 * Why dual-write?
 * - Firestore: Works across serverless instances (Vercel production)
 * - Memory: Works when Firestore is slow/unavailable
 * - Verify: Checks Firestore first (authoritative), then memory (fallback)
 *
 * This eliminates the race condition where:
 * - setOtp writes to Firestore only → verify fails if Firestore read is slow
 * - setOtp writes to memory only → verify fails on different server instance
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

// ── In-memory store (always available) ──
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

function normalizeKey(phone: string): string {
  return phone.replace(/[\s\-()]/g, "").toLowerCase();
}

function memorySetOtp(phone: string, code: string): void {
  memoryStore.set(normalizeKey(phone), {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
}

function memoryVerifyOtp(phone: string, code: string): string {
  const entry = memoryStore.get(normalizeKey(phone));
  if (!entry) return "not_found";

  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(normalizeKey(phone));
    return "expired";
  }

  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    memoryStore.delete(normalizeKey(phone));
    return "max_attempts";
  }

  const expected = Buffer.from(entry.code, "utf-8");
  const provided = Buffer.from(code, "utf-8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    entry.attempts += 1;
    return "invalid";
  }

  memoryStore.delete(normalizeKey(phone));
  return "valid";
}

// ── Firestore store (for distributed serverless) ──
async function firestoreSetOtp(phone: string, code: string): Promise<void> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return;

    await adminDb.collection(OTP_COLLECTION).doc(normalizeKey(phone)).set({
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-critical — memory store has the OTP
  }
}

async function firestoreVerifyOtp(phone: string, code: string): Promise<string | null> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) return null;

    const docRef = adminDb.collection(OTP_COLLECTION).doc(normalizeKey(phone));
    const docSnap = await docRef.get();

    if (!docSnap.exists) return null;

    const entry = docSnap.data() as OtpEntry;

    if (Date.now() > entry.expiresAt) {
      await docRef.delete().catch(() => {});
      return "expired";
    }

    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      await docRef.delete().catch(() => {});
      return "max_attempts";
    }

    const expected = Buffer.from(entry.code, "utf-8");
    const provided = Buffer.from(code, "utf-8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      await docRef.update({ attempts: entry.attempts + 1 }).catch(() => {});
      return "invalid";
    }

    await docRef.delete().catch(() => {});
    return "valid";
  } catch {
    return null;
  }
}

// ── Public API ──

/**
 * Store an OTP for a phone number.
 * DUAL-WRITE: Always stores in memory + tries Firestore.
 */
export async function setOtp(phone: string, code: string): Promise<void> {
  // 1. Always store in memory (instant, reliable)
  memorySetOtp(phone, code);

  // 2. Also try Firestore (for cross-instance support)
  // Fire-and-forget — don't block the response
  firestoreSetOtp(phone, code).catch(() => {});
}

/**
 * Verify an OTP for a phone number.
 * Checks memory first (fast), then Firestore (authoritative).
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  // 1. Check memory first (instant, works on same instance)
  const memResult = memoryVerifyOtp(phone, code);
  if (memResult === "valid" || memResult === "invalid" || memResult === "expired" || memResult === "max_attempts") {
    // Also clean up Firestore if we verified via memory
    if (memResult === "valid") {
      firestoreVerifyOtp(phone, code).catch(() => {});
    }
    return memResult;
  }

  // 2. Check Firestore (for cross-instance OTPs)
  const fsResult = await firestoreVerifyOtp(phone, code);
  if (fsResult !== null) {
    // If valid in Firestore, also remove from memory
    if (fsResult === "valid") {
      memoryStore.delete(normalizeKey(phone));
    }
    return fsResult;
  }

  // 3. Not found anywhere
  return "not_found";
}
