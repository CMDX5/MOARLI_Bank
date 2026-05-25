import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnv, ENV_SCHEMA } from "../validate-env";

/**
 * Tests for runtime environment variable validation.
 * Uses vi.stubEnv() to safely mock NODE_ENV without TS readonly errors.
 */

describe("validate-env", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns ok: true when all required production vars are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyDemoKey123456");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/service-account.json";
    process.env.MORALI_PIN_MASTER_KEY = "a".repeat(32);
    process.env.ADMIN_EMAIL = "admin@morali.pay";
    process.env.ADMIN_PASSWORD_HASH = "$2b$10$abcdefghijklmnopqrstuvwx";

    const result = validateEnv();
    expect(result.ok).toBe(true);
    expect(result.missing.filter((m) => m.severity === "error")).toHaveLength(0);
  });

  it("returns ok: false when a required production var is missing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyDemoKey123456");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project");
    // Clean up vars set by previous tests
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.MORALI_PIN_MASTER_KEY;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD_HASH;
    // Missing: AUTH_DOMAIN, APP_ID, GOOGLE_APPLICATION_CREDENTIALS, MORALI_PIN_MASTER_KEY, ADMIN_EMAIL, ADMIN_PASSWORD_HASH

    const result = validateEnv();
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.name === "MORALI_PIN_MASTER_KEY")).toBe(true);
    expect(result.missing.some((m) => m.name === "GOOGLE_APPLICATION_CREDENTIALS")).toBe(true);
  });

  it("returns ok: true in development even when production vars are missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    // No Firebase vars set at all

    const result = validateEnv();
    expect(result.ok).toBe(true);
    // Should have warnings but no errors
    expect(result.missing.filter((m) => m.severity === "error")).toHaveLength(0);
  });

  it("returns ok: true in CI even when production vars are missing", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CI", "true");

    const result = validateEnv();
    expect(result.ok).toBe(true);
  });

  it("flags MORALI_PIN_MASTER_KEY as invalid if too short", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyDemoKey123456");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/service-account.json";
    process.env.MORALI_PIN_MASTER_KEY = "short"; // Too short
    process.env.ADMIN_EMAIL = "admin@morali.pay";
    process.env.ADMIN_PASSWORD_HASH = "$2b$10$abcdefghijklmnopqrstuvwx";

    const result = validateEnv();
    expect(result.ok).toBe(false);
    const pinInvalid = result.invalid.find((i) => i.name === "MORALI_PIN_MASTER_KEY");
    expect(pinInvalid).toBeDefined();
    expect(pinInvalid!.error).toContain("Trop court");
  });

  it("flags ADMIN_EMAIL as invalid if not an email format", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyDemoKey123456");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "demo.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/service-account.json";
    process.env.MORALI_PIN_MASTER_KEY = "a".repeat(32);
    process.env.ADMIN_EMAIL = "notanemail";
    process.env.ADMIN_PASSWORD_HASH = "$2b$10$abcdefghijklmnopqrstuvwx";

    const result = validateEnv();
    expect(result.ok).toBe(false);
    const emailInvalid = result.invalid.find((i) => i.name === "ADMIN_EMAIL");
    expect(emailInvalid).toBeDefined();
    expect(emailInvalid!.error).toContain("email invalide");
  });

  it("flags ALLOW_INSECURE_AUTH=true as invalid in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_INSECURE_AUTH = "true";

    const result = validateEnv();
    const insecure = result.invalid.find((i) => i.name === "ALLOW_INSECURE_AUTH");
    expect(insecure).toBeDefined();
    expect(insecure!.error).toContain("CRITIQUE");
  });

  it("ALLOW_INSECURE_AUTH=true is allowed in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.ALLOW_INSECURE_AUTH = "true";

    const result = validateEnv();
    const insecure = result.invalid.find((i) => i.name === "ALLOW_INSECURE_AUTH");
    expect(insecure).toBeUndefined();
  });

  it("categorizes optional vars as optionalMissing when not set", () => {
    vi.stubEnv("NODE_ENV", "development");
    // Remove optional vars
    delete process.env.RESEND_API_KEY;
    delete process.env.SMS_API_KEY;
    delete process.env.PAYMENT_WEBHOOK_SECRET;

    const result = validateEnv();
    expect(result.optionalMissing.length).toBeGreaterThanOrEqual(3);
    expect(result.optionalMissing.some((m) => m.name === "RESEND_API_KEY")).toBe(true);
    expect(result.optionalMissing.some((m) => m.name === "SMS_API_KEY")).toBe(true);
  });

  it("masks sensitive values in valid results", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIzaSyDemoKey123456");
    process.env.MORALI_PIN_MASTER_KEY = "a".repeat(32);

    const result = validateEnv();
    const firebaseVar = result.valid.find((v) => v.name === "NEXT_PUBLIC_FIREBASE_API_KEY");
    expect(firebaseVar).toBeDefined();
    // Public vars show first 8 chars (remaining masked)
    expect(firebaseVar!.value).toMatch(/^AIzaSyDe\*+$/);

    const pinVar = result.valid.find((v) => v.name === "MORALI_PIN_MASTER_KEY");
    expect(pinVar).toBeDefined();
    // Server-only vars are fully masked
    expect(pinVar!.value).toBe("********");
  });
});

describe("ENV_SCHEMA", () => {
  it("has all critical Morali variables defined", () => {
    const names = ENV_SCHEMA.map((s) => s.name);
    // Firebase client
    expect(names).toContain("NEXT_PUBLIC_FIREBASE_API_KEY");
    expect(names).toContain("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    // Firebase admin
    expect(names).toContain("GOOGLE_APPLICATION_CREDENTIALS");
    // PIN security
    expect(names).toContain("MORALI_PIN_MASTER_KEY");
    // Admin
    expect(names).toContain("ADMIN_EMAIL");
    expect(names).toContain("ADMIN_PASSWORD_HASH");
    // Email / SMS
    expect(names).toContain("RESEND_API_KEY");
    expect(names).toContain("SMS_API_KEY");
    // Security
    expect(names).toContain("ALLOW_INSECURE_AUTH");
  });

  it("correctly marks public variables", () => {
    const publicVars = ENV_SCHEMA.filter((s) => s.isPublic).map((s) => s.name);
    expect(publicVars).toContain("NEXT_PUBLIC_FIREBASE_API_KEY");
    expect(publicVars).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(publicVars).not.toContain("MORALI_PIN_MASTER_KEY");
    expect(publicVars).not.toContain("ADMIN_PASSWORD_HASH");
    expect(publicVars).not.toContain("GOOGLE_APPLICATION_CREDENTIALS");
  });

  it("correctly marks MORALI_PIN_MASTER_KEY as required in production", () => {
    const pinSpec = ENV_SCHEMA.find((s) => s.name === "MORALI_PIN_MASTER_KEY");
    expect(pinSpec).toBeDefined();
    expect(pinSpec!.required).toBe("production");
    expect(pinSpec!.minLength).toBe(32);
  });

  it("correctly marks ALLOW_INSECURE_AUTH as optional", () => {
    const spec = ENV_SCHEMA.find((s) => s.name === "ALLOW_INSECURE_AUTH");
    expect(spec).toBeDefined();
    expect(spec!.required).toBe("optional");
  });
});
