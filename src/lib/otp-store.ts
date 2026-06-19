/**
 * Dual-write OTP store — Memory + Firebase Client SDK Firestore.
 *
 * Why dual-write?
 * - Firebase Client SDK Firestore: Works across ALL serverless instances (Vercel production)
 *   because it uses NEXT_PUBLIC_* env vars that ARE configured on Vercel.
 * - Memory: Fast local cache, works when Firestore is temporarily unavailable
 *
 * Verify order: Firestore first (authoritative), then memory (fallback).
 * This fixes the Vercel serverless issue where Admin SDK returns null (no credentials)
 * and in-memory Map doesn't persist between instances.
 */

import { timingSafeEqual, randomBytes } from "crypto";
import { doc, setDoc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";

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

// ── In-memory store (local cache, always available) ──
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

// ── Firestore store using Firebase Client SDK (works on Vercel!) ──

async function firestoreSetOtp(phone: string, code: string): Promise<boolean> {
  try {
    const key = normalizeKey(phone);
    const docRef = doc(firebaseDb, OTP_COLLECTION, key);
    await setDoc(docRef, {
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error("[otp-store] Firestore setOtp failed:", err);
    return false;
  }
}

async function firestoreVerifyOtp(phone: string, code: string): Promise<string | null> {
  try {
    const key = normalizeKey(phone);
    const docRef = doc(firebaseDb, OTP_COLLECTION, key);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    const entry = docSnap.data() as OtpEntry;

    if (Date.now() > entry.expiresAt) {
      await deleteDoc(docRef).catch(() => {});
      return "expired";
    }

    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      await deleteDoc(docRef).catch(() => {});
      return "max_attempts";
    }

    const expected = Buffer.from(entry.code, "utf-8");
    const provided = Buffer.from(code, "utf-8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      await updateDoc(docRef, { attempts: entry.attempts + 1 }).catch(() => {});
      return "invalid";
    }

    await deleteDoc(docRef).catch(() => {});
    return "valid";
  } catch (err) {
    console.error("[otp-store] Firestore verifyOtp failed:", err);
    return null;
  }
}

// ── Reset verification tokens ──
// When an OTP is verified for password reset, a short-lived token is created.
// The reset-password endpoint requires this token to proceed.
//
// SECURITY FIX: Tokens are now dual-stored in Firestore (Client SDK) + memory.
// Pure in-memory storage failed on Vercel serverless: each function invocation
// runs in a separate instance, so a token created in one instance was invisible
// to the one handling /api/auth/reset-password — forcing users to retry.
// Firestore is the authoritative store; memory is a same-instance fast path.

const verifiedResetTokens = new Map<string, number>(); // token → expiresAt
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_COLLECTION = "resetTokenStore";

/** Cleanup expired reset tokens from memory every 5 minutes */
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of verifiedResetTokens.entries()) {
      if (expiresAt < now) verifiedResetTokens.delete(key);
    }
  }, 5 * 60 * 1000);
}

async function firestoreSetResetToken(token: string, expiresAt: number): Promise<void> {
  try {
    const docRef = doc(firebaseDb, RESET_TOKEN_COLLECTION, token);
    await setDoc(docRef, { expiresAt, createdAt: Date.now() });
  } catch (err) {
    console.error("[otp-store] firestoreSetResetToken failed:", err);
  }
}

async function firestoreConsumeResetToken(token: string): Promise<boolean> {
  try {
    const docRef = doc(firebaseDb, RESET_TOKEN_COLLECTION, token);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;
    const { expiresAt } = snap.data() as { expiresAt: number };
    if (Date.now() > expiresAt) {
      await deleteDoc(docRef).catch(() => {});
      return false;
    }
    // One-time use — delete immediately
    await deleteDoc(docRef).catch(() => {});
    return true;
  } catch (err) {
    console.error("[otp-store] firestoreConsumeResetToken failed:", err);
    return false;
  }
}

// ── Public API ──

/**
 * Store an OTP for a phone number.
 * DUAL-WRITE: Always stores in memory + Firestore (Client SDK).
 */
export async function setOtp(phone: string, code: string): Promise<void> {
  // 1. Always store in memory (instant local cache)
  memorySetOtp(phone, code);

  // 2. Also store in Firestore via Client SDK (authoritative, cross-instance)
  // This MUST succeed for Vercel serverless to work
  await firestoreSetOtp(phone, code);
}

/**
 * Verify an OTP for a phone number.
 * Checks Firestore first (authoritative), then memory (fallback).
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  // 1. Check Firestore first (authoritative — works across all instances)
  const fsResult = await firestoreVerifyOtp(phone, code);
  if (fsResult !== null) {
    // If valid in Firestore, also clean up memory
    if (fsResult === "valid") {
      memoryStore.delete(normalizeKey(phone));
    }
    return fsResult;
  }

  // 2. Fallback to memory (same-instance cache)
  const memResult = memoryVerifyOtp(phone, code);
  if (memResult !== "not_found") {
    return memResult;
  }

  // 3. Not found anywhere
  return "not_found";
}

/**
 * Mark an OTP as verified for password reset purpose.
 * Returns a reset token that must be passed to /api/auth/reset-password.
 * Token expires in 5 minutes (one-time use).
 * DUAL-WRITE: stored in Firestore + memory for cross-instance reliability.
 */
export async function createResetToken(email: string): Promise<string> {
  // SECURITY FIX: token must be cryptographically random and unguessable.
  // Previously it was `rst_base64(email:timestamp)` — fully deterministic
  // from public data, allowing an attacker to forge a reset token for any
  // account WITHOUT the OTP. 256 bits of entropy makes brute-force infeasible.
  void normalizeKey(email); // kept for API stability; not used as token material
  const token = `rst_${randomBytes(32).toString("hex")}`;
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;

  // Store in memory (fast path for same-instance)
  verifiedResetTokens.set(token, expiresAt);

  // Store in Firestore (authoritative for cross-instance / serverless)
  await firestoreSetResetToken(token, expiresAt);

  return token;
}

/**
 * Check if a reset token is valid and consume it (one-time use).
 * Checks Firestore first (authoritative), then memory fallback.
 * Returns true if valid, false if invalid/expired/already consumed.
 */
export async function consumeResetToken(token: string): Promise<boolean> {
  if (!token) return false;

  // 1. Try Firestore first (cross-instance authoritative)
  const fsResult = await firestoreConsumeResetToken(token);
  if (fsResult) {
    // Also clean up memory
    verifiedResetTokens.delete(token);
    return true;
  }

  // 2. Fallback: memory (same-instance, e.g. dev environment)
  const expiresAt = verifiedResetTokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    verifiedResetTokens.delete(token);
    return false;
  }
  verifiedResetTokens.delete(token); // One-time use
  return true;
}
