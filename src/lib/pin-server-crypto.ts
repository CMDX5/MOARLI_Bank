/**
 * Server-side PIN encryption utility for MORALI PAY.
 *
 * Uses AES-256-GCM with a server-side master key to encrypt/decrypt PINs.
 * The master key comes only from MORALI_PIN_MASTER_KEY (32 bytes: 64 hex chars,
 * standard base64, or exactly 32 UTF-8 bytes). There is no in-repo fallback.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const CURRENT_KEY_VERSION = "v1";

const KEY_VERSION_CONFIG: Record<string, { envVar: string }> = {
  v1: { envVar: "MORALI_PIN_MASTER_KEY" },
};

/**
 * Decode MORALI_PIN_MASTER_KEY into exactly 32 bytes.
 * Hex (64 chars) and base64 are full-entropy. A raw 32-byte string is accepted
 * so existing deployments keep working.
 */
export function decodeMasterKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length >= 43 && trimmed.length <= 88) {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  }

  if (Buffer.byteLength(trimmed, "utf8") === 32) {
    return Buffer.from(trimmed, "utf8");
  }

  return null;
}

function deriveUserKey(masterKey: Buffer, uid: string, keyVersion: string): Buffer {
  const hmac = createHmac("sha256", masterKey);
  hmac.update(`morali-pin-encryption:${keyVersion}:${uid}`);
  return Buffer.from(hmac.digest().slice(0, 32));
}

function readEnvKey(version: string): string | null {
  const config = KEY_VERSION_CONFIG[version];
  if (!config) return null;
  const envKey = process.env[config.envVar];
  if (!envKey || !envKey.trim()) return null;
  return envKey;
}

function getVersionedKey(version: string): Buffer | null {
  const envKey = readEnvKey(version);
  if (!envKey) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[pin-crypto] CRITICAL: master key missing for version ${version}`);
    }
    return null;
  }

  const decoded = decodeMasterKey(envKey);
  if (!decoded) {
    console.error(`[pin-crypto] CRITICAL: master key for version ${version} is not 32 bytes`);
    return null;
  }
  return decoded;
}

/**
 * Keys written before the hex/base64 decoder used the first 32 UTF-8 characters.
 * Tried only on decrypt so previously stored PINs still open.
 */
function getLegacyTruncatedKey(version: string): Buffer | null {
  const envKey = readEnvKey(version);
  if (!envKey || envKey.length < 32) return null;
  const truncated = Buffer.from(envKey.slice(0, 32), "utf8");
  const current = decodeMasterKey(envKey);
  if (current && truncated.equals(current)) return null;
  return truncated;
}

function getMasterKey(): Buffer | null {
  return getVersionedKey(CURRENT_KEY_VERSION);
}

function decryptPayload(payload: Buffer, userKey: Buffer): string | null {
  if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;

  const iv = payload.slice(0, IV_LENGTH);
  const authTag = payload.slice(payload.length - AUTH_TAG_LENGTH);
  const ciphertext = payload.slice(IV_LENGTH, payload.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, userKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const pin = decrypted.toString("utf8");
  if (/^\d{4}$/.test(pin)) return pin;
  return null;
}

export function encryptPinServerSide(pin: string, uid: string): string | null {
  const masterKey = getMasterKey();
  if (!masterKey) return null;

  const userKey = deriveUserKey(masterKey, uid, CURRENT_KEY_VERSION);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, userKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const versionBuf = Buffer.from(CURRENT_KEY_VERSION + ":", "utf8");
  const combined = Buffer.concat([versionBuf, iv, encrypted, authTag]);
  return combined.toString("base64");
}

export function decryptPinServerSide(encryptedBase64: string, uid: string): string | null {
  try {
    if (!encryptedBase64) return null;

    const combined = Buffer.from(encryptedBase64, "base64");
    if (combined.length === 0) return null;

    let version = CURRENT_KEY_VERSION;
    let payload = combined;
    const colonIdx = combined.indexOf(0x3a);
    if (colonIdx > 0 && colonIdx <= 4) {
      const potentialVersion = combined.slice(0, colonIdx).toString("utf8");
      if (KEY_VERSION_CONFIG[potentialVersion]) {
        version = potentialVersion;
        payload = combined.slice(colonIdx + 1);
      }
    }

    const masterKey = getVersionedKey(version);
    if (masterKey) {
      const pin = decryptPayload(payload, deriveUserKey(masterKey, uid, version));
      if (pin) return pin;
    }

    const legacy = getLegacyTruncatedKey(version);
    if (!legacy) return null;
    return decryptPayload(payload, deriveUserKey(legacy, uid, version));
  } catch {
    return null;
  }
}
