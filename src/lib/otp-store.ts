/**
 * Shared in-memory OTP store.
 * For production with multiple server instances, replace with Redis.
 */

import { timingSafeEqual } from "crypto";

type OtpEntry = {
  code: string;
  expiresAt: number;
  attempts: number;
};

const otpStore = new Map<string, OtpEntry>();

/** OTP expiry: 5 minutes */
export const OTP_EXPIRY_MS = 5 * 60 * 1000;
/** Max verification attempts per OTP */
export const MAX_OTP_ATTEMPTS = 3;

/**
 * Store an OTP for a phone number.
 */
export function setOtp(phone: string, code: string): void {
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });
  cleanExpired();
}

/**
 * Verify an OTP for a phone number.
 * Returns:
 *   - "valid" on success
 *   - "invalid" if code doesn't match
 *   - "expired" if OTP has expired
 *   - "max_attempts" if too many attempts
 *   - "not_found" if no OTP exists
 */
export function verifyOtp(phone: string, code: string): string {
  const entry = otpStore.get(phone);
  if (!entry) return "not_found";

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return "expired";
  }

  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(phone);
    return "max_attempts";
  }

  // Timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(entry.code, "utf-8");
  const provided = Buffer.from(code, "utf-8");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    entry.attempts += 1;
    return "invalid";
  }

  // Valid — remove the OTP
  otpStore.delete(phone);
  return "valid";
}

/**
 * Remove expired entries from the store.
 */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, val] of otpStore) {
    if (val.expiresAt < now) otpStore.delete(key);
  }
}
