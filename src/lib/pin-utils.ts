/**
 * Secure PIN utilities for MORALI PAY.
 *
 * IMPORTANT (Phase 3c — bcrypt migration):
 * ========================================
 * PIN hashing is now done SERVER-SIDE with bcrypt (work factor 12).
 * The client should NEVER hash a PIN for storage/verification purposes.
 *
 * This file retains:
 * - AES-GCM encryption/decryption for PIN reveal feature (browser-only)
 *
 * Removed (client-side SHA-256 hashing is no longer used for PIN storage):
 * - hashPin() — replaced by server-side bcrypt
 * - verifyPin() — replaced by /api/verify-pin (bcrypt)
 * - generatePinSalt() — replaced by server-side bcrypt salt generation
 * - constantTimeCompare() — replaced by bcrypt's built-in timing-safe comparison
 */

/* ── AES-GCM Encryption for PIN Recovery (Browser-only) ── */

/**
 * Derive an AES-256-GCM key from a password + uid using PBKDF2.
 * Works only in browser (Web Crypto API).
 */
async function deriveKey(password: string, uid: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(`${uid}:${password}`),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 100_000, hash: "SHA-256" as const },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a PIN plaintext with the user's password (for server storage).
 * Returns { encryptedPin: base64, pinIv: base64 }.
 * Browser-only (Web Crypto API).
 */
export async function encryptPinWithPassword(
  pin: string,
  password: string,
  uid: string
): Promise<{ encryptedPin: string; pinIv: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, uid, salt);
  const encoder = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(pin)
  );
  // Prepend salt (16 bytes) + iv (12 bytes) to ciphertext for self-contained decryption
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return {
    encryptedPin: btoa(String.fromCharCode(...combined)),
    pinIv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt a PIN using the user's password.
 * Takes the base64-encoded encryptedPin (salt+iv+ciphertext).
 * Browser-only (Web Crypto API).
 */
export async function decryptPinWithPassword(
  encryptedPinBase64: string,
  password: string,
  uid: string
): Promise<string | null> {
  try {
    const combined = Uint8Array.from(atob(encryptedPinBase64), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);
    const key = await deriveKey(password, uid, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    // Wrong password or corrupted data
    return null;
  }
}
