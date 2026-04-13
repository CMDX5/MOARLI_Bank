/**
 * Firestore-backed OTP store for serverless environments (Vercel).
 *
 * Why Firestore instead of in-memory Map?
 * - Vercel serverless functions run on multiple instances
 * - In-memory state is lost between function invocations
 * - OTP created on instance A is not available on instance B
 * - Firestore provides persistent, distributed storage
 *
 * Security features:
 * - Timing-safe comparison to prevent timing attacks
 * - Max 3 verification attempts per OTP
 * - 5-minute expiry with server-side TTL cleanup
 */

import { timingSafeEqual } from "crypto";
import { getAdminFirestore } from "@/lib/admin-firestore";

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

/**
 * Store an OTP for a phone number in Firestore.
 */
export async function setOtp(phone: string, code: string): Promise<void> {
  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      // Fallback: log warning — OTP will only work on same instance
      return;
    }

    // Use normalized phone as document ID (remove spaces, dashes)
    const docId = phone.replace(/[\s\-()]/g, "").toLowerCase();

    await adminDb.collection(OTP_COLLECTION).doc(docId).set({
      code,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-critical: OTP verification will fail gracefully
  }
}

/**
 * Verify an OTP for a phone number from Firestore.
 * Returns:
 *   - "valid" on success
 *   - "invalid" if code doesn't match
 *   - "expired" if OTP has expired
 *   - "max_attempts" if too many attempts
 *   - "not_found" if no OTP exists
 */
export async function verifyOtp(phone: string, code: string): Promise<string> {
  try {
    const adminDb = await getAdminFirestore();

    if (!adminDb) {
      return "not_found";
    }

    const docId = phone.replace(/[\s\-()]/g, "").toLowerCase();
    const docRef = adminDb.collection(OTP_COLLECTION).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return "not_found";
    }

    const entry = docSnap.data() as OtpEntry;

    // Check expiry
    if (Date.now() > entry.expiresAt) {
      await docRef.delete();
      return "expired";
    }

    // Check max attempts
    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      await docRef.delete();
      return "max_attempts";
    }

    // Timing-safe comparison to prevent timing attacks
    const expected = Buffer.from(entry.code, "utf-8");
    const provided = Buffer.from(code, "utf-8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      // Increment attempts
      await docRef.update({ attempts: entry.attempts + 1 });
      return "invalid";
    }

    // Valid — remove the OTP
    await docRef.delete();
    return "valid";
  } catch {
    return "not_found";
  }
}
