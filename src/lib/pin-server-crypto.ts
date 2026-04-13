/**
 * Server-side PIN encryption utility for MORALI PAY.
 *
 * Uses AES-256-GCM with a server-side master key to encrypt/decrypt PINs.
 * This allows the server to reveal a PIN after verifying the user's identity
 * via Firebase re-authentication (password check).
 *
 * Security model:
 * - PIN is stored as bcrypt hash (for verification during transactions)
 * - PIN is ALSO stored as AES-256-GCM encrypted (for reveal after auth)
 * - Master key is derived from env variable MORALI_PIN_MASTER_KEY
 * - Each user gets a unique key derived from master key + UID (HKDF)
 * - If master key is not set, falls back to a deterministic key (less secure, dev only)
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a per-user encryption key from master key + UID using HMAC-based key derivation.
 */
function deriveUserKey(masterKey: Buffer, uid: string): Buffer {
  // Use HMAC-SHA256 with the UID as message to derive a unique key per user
  const hmac = createHmac("sha256", masterKey);
  hmac.update(`morali-pin-encryption:${uid}`);
  // Use first 32 bytes for AES-256
  return Buffer.from(hmac.digest().slice(0, 32));
}

/**
 * Get or generate the master encryption key.
 */
function getMasterKey(): Buffer {
  const envKey = process.env.MORALI_PIN_MASTER_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf8");
  }
  // Fallback for development — deterministic but NOT secure for production
  console.warn("[pin-crypto] ⚠️ MORALI_PIN_MASTER_KEY not set or too short. Using fallback key.");
  return Buffer.from("morali-dev-fallback-key-32bytes-ok!!", "utf8");
}

/**
 * Encrypt a PIN for server-side storage.
 * Returns base64-encoded string (IV + ciphertext + auth tag).
 */
export function encryptPinServerSide(pin: string, uid: string): string {
  const masterKey = getMasterKey();
  const userKey = deriveUserKey(masterKey, uid);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, userKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(pin, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: IV (12 bytes) + ciphertext + authTag (16 bytes)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a server-side encrypted PIN.
 * Returns the plaintext PIN or null if decryption fails.
 */
export function decryptPinServerSide(encryptedBase64: string, uid: string): string | null {
  try {
    const masterKey = getMasterKey();
    const userKey = deriveUserKey(masterKey, uid);

    const combined = Buffer.from(encryptedBase64, "base64");

    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return null; // Too short to be valid
    }

    const iv = combined.slice(0, IV_LENGTH);
    const authTag = combined.slice(combined.length - AUTH_TAG_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, userKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const pin = decrypted.toString("utf8");
    // Validate it's a 4-digit PIN
    if (/^\d{4}$/.test(pin)) {
      return pin;
    }
    return null;
  } catch {
    return null; // Decryption failed (wrong key, corrupted data, etc.)
  }
}
