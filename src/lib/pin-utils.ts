/**
 * Secure PIN hashing utilities.
 * Uses SHA-256 via Web Crypto API (client) or Node crypto (server).
 *
 * Security notes:
 * - PINs are hashed before storage (never plaintext)
 * - Uses per-user salt (uid-based) to prevent rainbow table attacks
 * - Constant-time comparison to prevent timing attacks
 */

/**
 * Constant-time string comparison (works in both browser and Node.js).
 * Iterates through all characters regardless of mismatch position.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Hash a PIN with a salt using SHA-256.
 * Works in both browser (Web Crypto) and Node.js (crypto).
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const combined = `${salt}:${pin}`;

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    // Browser environment
    const encoder = new TextEncoder();
    const data = encoder.encode(combined);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node.js environment (API routes only)
  const { createHash } = await import("crypto");
  return createHash("sha256").update(combined).digest("hex");
}

/**
 * Verify a PIN against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPin(pin: string, salt: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashPin(pin, salt);
  return constantTimeCompare(computedHash, storedHash);
}

/**
 * Generate a random salt for PIN hashing.
 */
export async function generatePinSalt(): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node.js fallback
  const { randomBytes } = await import("crypto");
  return randomBytes(16).toString("hex");
}

/* ── AES-GCM Encryption for PIN Recovery ── */

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
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
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
