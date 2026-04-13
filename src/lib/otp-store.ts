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

import { timingSafeEqual } from "crypto";
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
