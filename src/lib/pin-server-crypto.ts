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
 * - Key versioning: encrypted payloads include a version byte for future key rotation
 *
 * Key Rotation Strategy:
 * - Each encrypted PIN includes a version prefix (currently "v1")
 * - When rotating the master key, increment the version to "v2"
 * - Old PINs with "v1" prefix will still decrypt with the old key
 * - New PINs will be encrypted with "v2" and the new key
 * - A migration job can re-encrypt old PINs lazily on next PIN set
 *
 * SECURITY FIX: In production, master key is MANDATORY. No fallback.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Key versioning: prefix for encrypted payloads
// "v1" = current version using MORALI_PIN_MASTER_KEY
// Future: "v2" would use a new key, allowing gradual migration
const CURRENT_KEY_VERSION = "v1";

// Map of key version to env var name
// When rotating keys, add new versions here and keep old ones for decryption
const KEY_VERSION_CONFIG: Record<string, { envVar: string }> = {
  v1: { envVar: "MORALI_PIN_MASTER_KEY" },
  // Future: v2: { envVar: "MORALI_PIN_MASTER_KEY_V2" },
};

/**
 * Derive a per-user encryption key from master key + UID using HMAC-based key derivation.
 * Includes key version in derivation for forward secrecy between key versions.
 */
function deriveUserKey(masterKey: Buffer, uid: string, keyVersion: string): Buffer {
  const hmac = createHmac("sha256", masterKey);
  hmac.update(`morali-pin-encryption:${keyVersion}:${uid}`);
  return Buffer.from(hmac.digest().slice(0, 32));
}

/**
 * Get a master encryption key for a given key version.
 */
function getVersionedKey(version: string): Buffer | null {
  const config = KEY_VERSION_CONFIG[version];
  if (!config) return null;

  const envKey = process.env[config.envVar];
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf8");
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      `[pin-crypto] CRITICAL: ${config.envVar} is not set or too short (version ${version})!`,
    );
    return null;
  }

  // Development only fallback
  if (version === "v1") {
    console.warn("[pin-crypto] WARNING: Using development fallback key for v1. DO NOT use in production.");
    return Buffer.from("morali-dev-fallback-key-32bytes-ok!!", "utf8");
  }

  return null;
}

/**
 * Get the current (latest) master encryption key.
 */
function getMasterKey(): Buffer | null {
  return getVersionedKey(CURRENT_KEY_VERSION);
}

/**
 * Encrypt a PIN for server-side storage.
 * Format: base64( version_prefix + IV + ciphertext + authTag )
 * Returns base64-encoded string, or null if master key unavailable.
 */
export function encryptPinServerSide(pin: string, uid: string): string | null {
  const masterKey = getMasterKey();
  if (!masterKey) return null;

  const userKey = deriveUserKey(masterKey, uid, CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, userKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(pin, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Prepend version prefix for future key rotation support
  const versionBuf = Buffer.from(CURRENT_KEY_VERSION + ":", "utf8");
  const combined = Buffer.concat([versionBuf, iv, encrypted, authTag]);
  return combined.toString("base64");
}

/**
 * Decrypt a server-side encrypted PIN.
 * Supports key versioning: reads version prefix from payload and uses
 * the corresponding key. Old v1 PINs still decrypt even after adding v2.
 * Returns the plaintext PIN or null if decryption fails or master key unavailable.
 */
export function decryptPinServerSide(encryptedBase64: string, uid: string): string | null {
  try {
    const combined = Buffer.from(encryptedBase64, "utf8");

    // Try to extract version prefix (format: "v1:...")
    let version = CURRENT_KEY_VERSION;
    let payload = combined;
    const colonIdx = combined.indexOf(0x3A); // ':' character
    if (colonIdx > 0 && colonIdx <= 3) {
      const potentialVersion = combined.slice(0, colonIdx).toString("utf8");
      if (KEY_VERSION_CONFIG[potentialVersion]) {
        version = potentialVersion;
        payload = combined.slice(colonIdx + 1);
      }
    }

    // Handle backward compatibility: payloads without version prefix (created before key versioning)
    const isBase64 = combined.length > 0 && /[A-Za-z0-9+/=]/.test(combined.toString("utf8").slice(0, 4));
    if (!isBase64) {
      payload = Buffer.from(encryptedBase64, "base64");
    }

    const masterKey = getVersionedKey(version);
    if (!masterKey) {
      console.error(`[pin-crypto] No key available for version ${version}`);
      return null;
    }

    const userKey = deriveUserKey(masterKey, uid, version);

    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return null; // Too short to be valid
    }

    const iv = payload.slice(0, IV_LENGTH);
    const authTag = payload.slice(payload.length - AUTH_TAG_LENGTH);
    const ciphertext = payload.slice(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);

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
