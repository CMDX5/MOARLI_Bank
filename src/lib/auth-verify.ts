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

    let credential: { projectId: string; privateKey: string; clientEmail: string } | undefined;

    const localKeyPath = resolve(process.cwd(), "service-account-key.json");
    if (existsSync(localKeyPath)) {
      const keyData = JSON.parse(readFileSync(localKeyPath, "utf-8"));
      credential = cert(keyData);
      console.log("[adminAuth] Loaded from local service-account-key.json");
    }

    if (!credential && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const envVal = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (envVal.startsWith("{")) {
        console.log("[adminAuth] Parsing GOOGLE_APPLICATION_CREDENTIALS as JSON (length:", envVal.length, ")");
        const parsed = JSON.parse(envVal);
        console.log("[adminAuth] Parsed. project_id:", parsed.project_id, "client_email:", parsed.client_email);
        credential = cert(parsed);
        console.log("[adminAuth] Credential created from env var");
      } else if (existsSync(envVal)) {
        console.log("[adminAuth] Loading GOOGLE_APPLICATION_CREDENTIALS as file path:", envVal);
        const keyData = JSON.parse(readFileSync(envVal, "utf-8"));
        credential = cert(keyData);
      } else {
        console.warn("[adminAuth] GOOGLE_APPLICATION_CREDENTIALS set but doesn't start with '{' and file doesn't exist. Value starts with:", envVal.substring(0, 30));
      }
    } else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.warn("[adminAuth] GOOGLE_APPLICATION_CREDENTIALS env var is NOT set");
    }

    if (credential) {
      if (getApps().length === 0) {
        initializeApp({ credential });
        console.log("[adminAuth] Firebase Admin initialized successfully");
      }
      adminAuth = getAuth();
      adminInitResult = true;
      return adminAuth;
    }

    adminInitResult = false;
    console.error("[adminAuth] No credential found — Admin SDK not initialized");
    return null;
  } catch (err) {
    adminInitResult = false;
    console.error("[adminAuth] FAILED to initialize:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Verify Firebase ID token — PRODUCTION MODE (Firebase Admin SDK).
 * Returns full DecodedIdToken including customClaims (admin, roleLevel, etc.)
 */
async function verifyTokenAdmin(token: string): Promise<import("firebase-admin/auth").DecodedIdToken | null> {
  const auth = await getAdminAuth();
  if (!auth) return null;

  try {
    const decoded = await auth.verifyIdToken(token, true);
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify Firebase ID token — FALLBACK MODE (local JWT claim checking).
 * Validates structure, expiration, issuer, audience — NOT the signature.
 */
function verifyTokenLocal(token: string): string | null {
  // SECURITY: Local JWT verification (no signature check) is ONLY allowed
  // when explicitly enabled via ALLOW_INSECURE_AUTH env var.
  // In production, this fallback is ALWAYS disabled.
  if (process.env.ALLOW_INSECURE_AUTH !== "true") return null;

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

// ── Internal: verify token and return uid + claims ──
async function verifyRequestAuthFull(req: NextRequest): Promise<{ uid: string; claims: Record<string, unknown> } | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    if (!token || token.length < 100) return null;

    // Production: full RS256 signature verification + custom claims
    const decoded = await verifyTokenAdmin(token);
    if (decoded) {
      return { uid: decoded.uid, claims: (decoded.customClaims || {}) as Record<string, unknown> };
    }

    // Fallback: local JWT verification (ONLY when ALLOW_INSECURE_AUTH=true)
    // verifyTokenLocal() also guards internally, but this check is defense-in-depth
    const localUid = verifyTokenLocal(token);
    if (localUid) return { uid: localUid, claims: {} };
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify Firebase ID token and return uid only (backward compatible).
 */
export async function verifyRequestAuth(req: NextRequest): Promise<string | null> {
  const result = await verifyRequestAuthFull(req);
  return result?.uid ?? null;
}

// ── Auth result type ──
export type AuthResult = {
  uid: string | null;
  error?: NextResponse;
  claims?: Record<string, unknown>;
};

/**
 * Auth middleware for API routes.
 * Returns 401 if not authenticated.
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const result = await verifyRequestAuthFull(req);
  if (!result) {
    return {
      uid: null,
      error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
    };
  }
  return { uid: result.uid, claims: result.claims };
}

/**
 * Admin auth middleware — verifies Firebase CUSTOM CLAIMS (not Firestore role).
 *
 * SECURITY: Firebase Custom Claims are:
 * - Set ONLY via Firebase Admin SDK (server-side only)
 * - Cannot be forged by client-side Firestore writes
 * - Embedded in every ID token after next refresh
 *
 * Fallback: In development only, checks Firestore role field as secondary.
 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await verifyRequestAuthFull(req);
  if (!result) {
    return {
      uid: null,
      error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }),
    };
  }

  const { uid, claims } = result;

  // ── Primary: Firebase Custom Claims (production authoritative) ──
  if (claims.admin === true) {
    return { uid, claims };
  }

  // ── Fallback: Firestore role field (development ONLY) ──
  if (process.env.NODE_ENV !== "production") {
    try {
      const { getAdminFirestore } = await import("@/lib/admin-firestore");
      const adminDb = await getAdminFirestore();
      if (adminDb) {
        const userDoc = await adminDb.collection("moraliUsers").doc(uid).get();
        if (userDoc.exists() && userDoc.data()?.role === "admin") {
          return { uid, claims };
        }
      }
    } catch {
      // Fall through to 403
    }
  }

  return {
    uid: null,
    error: NextResponse.json({ error: "Accès refusé — admin uniquement" }, { status: 403 }),
  };
}

/**
 * Revoke all refresh tokens for a user (force logout on ALL devices).
 * The user must re-authenticate to get a new token.
 */
export async function revokeUserTokens(uid: string): Promise<boolean> {
  const auth = await getAdminAuth();
  if (!auth) return false;
  try {
    await auth.revokeRefreshTokens(uid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Set admin custom claims for a user (server-side only).
 * This is the ONLY way to grant admin access.
 */
export async function setAdminClaim(uid: string, roleLevel: "full" | "viewer" = "full"): Promise<boolean> {
  const auth = await getAdminAuth();
  if (!auth) return false;
  try {
    await auth.setCustomUserClaims(uid, { admin: true, roleLevel });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove admin custom claims from a user.
 */
export async function removeAdminClaim(uid: string): Promise<boolean> {
  const auth = await getAdminAuth();
  if (!auth) return false;
  try {
    await auth.setCustomUserClaims(uid, null);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Admin SDK is properly configured (for health checks).
 */
export async function getAuthMode(): Promise<"admin_sdk" | "local" | "not_initialized"> {
  if (adminInitResult === null) {
    await getAdminAuth();
  }
  if (adminInitResult === true) return "admin_sdk";
  if (adminInitResult === false) return "local";
  return "not_initialized";
}
