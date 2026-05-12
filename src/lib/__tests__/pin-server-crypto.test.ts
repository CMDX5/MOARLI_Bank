import { describe, it, expect, beforeAll } from "vitest";
import { encryptPinServerSide, decryptPinServerSide } from "../pin-server-crypto";

describe("pin-server-crypto", () => {
  beforeAll(() => {
    // Ensure the dev fallback key is used (needs min 32 chars)
    // In dev mode, the library falls back automatically
    process.env.NODE_ENV = "test";
  });

  const testUid = "test-user-123";
  const testPin = "1234";
  const otherUid = "other-user-456";

  it("encrypts a 4-digit PIN and returns a base64 string", () => {
    const encrypted = encryptPinServerSide(testPin, testUid);
    expect(encrypted).not.toBeNull();
    expect(typeof encrypted).toBe("string");
    // base64 encoded (IV + ciphertext + authTag) should be > 12 bytes
    expect(encrypted!.length).toBeGreaterThan(20);
  });

  it("decrypts an encrypted PIN and returns the original", () => {
    const encrypted = encryptPinServerSide(testPin, testUid);
    expect(encrypted).not.toBeNull();

    const decrypted = decryptPinServerSide(encrypted!, testUid);
    expect(decrypted).toBe(testPin);
  });

  it("decrypts with wrong UID returns null (per-user key derivation)", () => {
    const encrypted = encryptPinServerSide(testPin, testUid);
    expect(encrypted).not.toBeNull();

    const decrypted = decryptPinServerSide(encrypted!, otherUid);
    expect(decrypted).toBeNull();
  });

  it("decrypts corrupted data returns null", () => {
    const corrupted = "this-is-not-valid-base64-or-encrypted-data!!!";
    const decrypted = decryptPinServerSide(corrupted, testUid);
    expect(decrypted).toBeNull();
  });

  it("decrypts empty string returns null", () => {
    const decrypted = decryptPinServerSide("", testUid);
    expect(decrypted).toBeNull();
  });

  it("decrypts too-short string returns null", () => {
    // Less than IV_LENGTH(12) + AUTH_TAG_LENGTH(16) + 1 = 29 chars
    const short = "aWVtdG9vc2hvcnQ="; // 16 chars base64
    const decrypted = decryptPinServerSide(short, testUid);
    expect(decrypted).toBeNull();
  });

  it("different PINs produce different ciphertexts", () => {
    const enc1 = encryptPinServerSide("1234", testUid);
    const enc2 = encryptPinServerSide("5678", testUid);
    expect(enc1).not.toBe(enc2);
  });

  it("same PIN same UID produces different ciphertexts (random IV)", () => {
    const enc1 = encryptPinServerSide(testPin, testUid);
    const enc2 = encryptPinServerSide(testPin, testUid);
    // AES-GCM uses random IV, so ciphertexts should differ
    expect(enc1).not.toBe(enc2);
    // But both should decrypt to the same PIN
    expect(decryptPinServerSide(enc1!, testUid)).toBe(testPin);
    expect(decryptPinServerSide(enc2!, testUid)).toBe(testPin);
  });
});
