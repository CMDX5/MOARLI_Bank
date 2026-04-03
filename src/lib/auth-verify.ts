import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const FIREBASE_PROJECT_ID = "banque-digitale";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

// Lazy-loaded admin auth instance
let adminAuth: import("firebase-admin/auth").Auth | null = null;
let adminInitAttempted = false;
let adminInitResult: boolean | null = null;

/**
 * Try to initialize Firebase Admin SDK.
 * Looks for credentials in order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS env var (path to JSON file)
 * 2. service-account-key.json in project root
 * 3. GOOGLE_APPLICATION_CREDENTIALS env var as JSON string
 */
export async function getAdminAuth(): Promise<import("firebase-admin/auth").Auth | null> {
  if (adminAuth) return adminAuth;
  if (adminInitAttempted) return null;

  adminInitAttempted = true;
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");

    // Try to find credentials
    let credential: { projectId: string; privateKey: string; clientEmail: string } | undefined;

    // 1. Check for local service account key file
    const localKeyPath = resolve(process.cwd(), "service-account-key.json");
    if (existsSync(localKeyPath)) {
      const keyData = JSON.parse(readFileSync(localKeyPath, "utf-8"));
      credential = cert(keyData);
    }

    // 2. Check GOOGLE_APPLICATION_CREDENTIALS env var
    if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const envVal = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (envVal.startsWith("{")) {
        // JSON string directly in env var
        credential = cert(JSON.parse(envVal));
      } else if (existsSync(envVal)) {
        // Path to JSON file
        const keyData = JSON.parse(readFileSync(envVal, "utf-8"));
        credential = cert(keyData);
      }
    }

    if (credential) {
      if (getApps().length === 0) {
        initializeApp({ credential });
      }
      adminAuth = getAuth();
      adminInitResult = true;
      return adminAuth;
    }

    // No credentials found — fallback to local verification
    adminInitResult = false;
    return null;
  } catch (err) {
    adminInitResult = false;
    return null;
  }
}

/**
 * Verify Firebase ID token — PRODUCTION MODE (Firebase Admin SDK).
 * This properly verifies the RS256 signature against Google's public keys.
 */
async function verifyTokenAdmin(token: string): Promise<string | null> {
  const auth = await getAdminAuth();
  if (!auth) return null;

  try {
    const decoded = await auth.verifyIdToken(token, true);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Verify Firebase ID token — FALLBACK MODE (local JWT claim checking).
 * This validates JWT structure, expiration, issuer, and audience
 * but does NOT verify the cryptographic signature.
 */
function verifyTokenLocal(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    if (header.alg !== "RS256") return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (!payload.iss || payload.iss !== FIREBASE_ISSUER) return null;
    if (!payload.aud || payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (!payload.sub || typeof payload.sub !== "string") return null;
    if (payload.iat && payload.iat > now + 300) return null;

    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Verify Firebase ID token from request.
 *
 * Production: Uses Firebase Admin SDK (full RS256 signature verification)
 * Development: Falls back to local JWT claim checking
 */
export async function verifyRequestAuth(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    if (!token || token.length < 100) return null;

    // Try Admin SDK first (production — full RS256 signature verification)
    const adminUid = await verifyTokenAdmin(token);
    if (adminUid) return adminUid;

    // Fallback to local verification (development / sandbox only)
    // In production, reject unverified tokens to prevent forged JWT attacks
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    return verifyTokenLocal(token);
  } catch {
    return null;
  }
}

/**
 * Auth middleware for API routes.
 * Returns 401 response if not authenticated, or null if valid.
 */
export async function requireAuth(req: NextRequest): Promise<{ uid: string | null; error?: NextResponse }> {
  const uid = await verifyRequestAuth(req);
  if (!uid) {
    return {
      uid: null,
      error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
    };
  }
  return { uid };
}

/**
 * Check if Admin SDK is properly configured (for health checks).
 * Returns "admin_sdk" (production), "local" (fallback), or null (not initialized).
 */
export async function getAuthMode(): Promise<"admin_sdk" | "local" | "not_initialized"> {
  if (adminInitResult === null) {
    // Force initialization attempt
    await getAdminAuth();
  }
  if (adminInitResult === true) return "admin_sdk";
  if (adminInitResult === false) return "local";
  return "not_initialized";
}
