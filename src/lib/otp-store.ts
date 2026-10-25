/**
 * OTP and password-reset tokens.
 *
 * Authoritative store: Firebase Admin SDK (documents are unreadable by clients).
 * Memory is only a same-process fallback when Admin SDK credentials are absent.
 * Reset tokens are bound to the email that verified the OTP.
 */

import { timingSafeEqual, randomBytes, createHash } from "crypto";

type OtpEntry = {
  code: string;
  expiresAt: number;
  attempts: number;
  createdAt: string;
};

type ResetRecord = {
  email: string;
  expiresAt: number;
};

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 3;
const OTP_COLLECTION = "otpStore";
const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const RESET_TOKEN_COLLECTION = "resetTokenStore";

const memoryStore = new Map<string, OtpEntry>();
const verifiedResetTokens = new Map<string, ResetRecord>();

function startJanitor(fn: () => void) {
  const timer = setInterval(fn, 5 * 60 * 1000);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
}

startJanitor(() => {
  const now = Date.now();
  for (const [key, val] of memoryStore.entries()) {
    if (val.expiresAt < now) memoryStore.delete(key);
  }
  for (const [key, val] of verifiedResetTokens.entries()) {
    if (val.expiresAt < now) verifiedResetTokens.delete(key);
  }
});

function normalizeKey(phone: string): string {
  return phone.replace(/[\s\-()]/g, "").toLowerCase();
}

function docId(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 700) || "empty";
}

function emailsMatch(a: string, b: string): boolean {
  const left = createHash("sha256").update(normalizeKey(a)).digest();
  const right = createHash("sha256").update(normalizeKey(b)).digest();
  return timingSafeEqual(left, right);
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
  const key = normalizeKey(phone);
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

async function adminDb() {
  const { getAdminFirestore } = await import("@/lib/admin-firestore");
  return getAdminFirestore();
}

async function firestoreSetOtp(phone: string, code: string): Promise<boolean> {
  try {
    const db = await adminDb();
    if (!db) return false;
    await db.collection(OTP_COLLECTION).doc(docId(normalizeKey(phone))).set({
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
    const db = await adminDb();
    if (!db) return null;
    const ref = db.collection(OTP_COLLECTION).doc(docId(normalizeKey(phone)));
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const entry = snap.data() as OtpEntry;
      if (Date.now() > entry.expiresAt) {
        tx.delete(ref);
        return "expired";
      }
      if (entry.attempts >= MAX_OTP_ATTEMPTS) {
        tx.delete(ref);
        return "max_attempts";
      }
      const expected = Buffer.from(entry.code, "utf-8");
      const provided = Buffer.from(code, "utf-8");
      if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        tx.update(ref, { attempts: (entry.attempts || 0) + 1 });
        return "invalid";
      }
      tx.delete(ref);
      return "valid";
    });
  } catch (err) {
    console.error("[otp-store] Firestore verifyOtp failed:", err);
    return null;
  }
}

type ConsumeResult = "consumed" | "rejected" | "missing";

async function firestoreSetResetToken(token: string, email: string, expiresAt: number): Promise<void> {
  try {
    const db = await adminDb();
    if (!db) return;
    await db.collection(RESET_TOKEN_COLLECTION).doc(token).set({
      email: normalizeKey(email),
      expiresAt,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.error("[otp-store] firestoreSetResetToken failed:", err);
  }
}

async function firestoreConsumeResetToken(token: string, email: string): Promise<ConsumeResult> {
  try {
    const db = await adminDb();
    if (!db) return "missing";
    const ref = db.collection(RESET_TOKEN_COLLECTION).doc(token);
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing";
      const data = snap.data() as { email?: string; expiresAt?: number };
      tx.delete(ref);
      if (!data.expiresAt || Date.now() > data.expiresAt) return "rejected";
      if (!data.email || !emailsMatch(data.email, email)) return "rejected";
      return "consumed";
    });
  } catch (err) {
    console.error("[otp-store] firestoreConsumeResetToken failed:", err);
    return "missing";
  }
}

function memoryConsumeResetToken(token: string, email: string): boolean {
  const record = verifiedResetTokens.get(token);
  if (!record) return false;
  verifiedResetTokens.delete(token);
  if (Date.now() > record.expiresAt) return false;
  return emailsMatch(record.email, email);
}

export async function setOtp(phone: string, code: string): Promise<void> {
  memorySetOtp(phone, code);
  await firestoreSetOtp(phone, code);
}

export async function verifyOtp(phone: string, code: string): Promise<string> {
  const fsResult = await firestoreVerifyOtp(phone, code);
  if (fsResult !== null) {
    if (fsResult === "valid") memoryStore.delete(normalizeKey(phone));
    return fsResult;
  }
  const memResult = memoryVerifyOtp(phone, code);
  if (memResult !== "not_found") return memResult;
  return "not_found";
}

export async function createResetToken(email: string): Promise<string> {
  const token = `rst_${randomBytes(32).toString("hex")}`;
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
  const normalized = normalizeKey(email);
  verifiedResetTokens.set(token, { email: normalized, expiresAt });
  await firestoreSetResetToken(token, normalized, expiresAt);
  return token;
}

/**
 * One-time consume. Returns true only when the token exists, is unexpired,
 * and was issued for this email.
 */
export async function consumeResetToken(token: string, email: string): Promise<boolean> {
  if (!token || !email) return false;
  const fsResult = await firestoreConsumeResetToken(token, email);
  if (fsResult === "consumed") {
    verifiedResetTokens.delete(token);
    return true;
  }
  if (fsResult === "rejected") {
    verifiedResetTokens.delete(token);
    return false;
  }
  return memoryConsumeResetToken(token, email);
}
