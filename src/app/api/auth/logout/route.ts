import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth, revokeUserTokens } from "@/lib/auth-verify";

/**
 * POST /api/auth/logout
 *
 * Revokes ALL refresh tokens for the authenticated user.
 * This forces logout on ALL devices — the user must re-authenticate.
 *
 * SECURITY:
 * - Requires valid Firebase ID token
 * - Calls revokeRefreshTokens() via Admin SDK
 * - Even if the client doesn't call this, tokens expire naturally (1h access, 30d refresh)
 */
export async function POST(req: NextRequest) {
  // Rate limit: 10 logout requests per minute per IP
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`auth:logout:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // Auth: verify the user is authenticated
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Revoke all refresh tokens — forces logout on ALL devices
  const revoked = await revokeUserTokens(auth.uid);

  if (revoked) {
    return NextResponse.json({
      success: true,
      message: "Déconnecté sur tous les appareils",
    });
  }

  // Admin SDK not available — return success anyway
  // Client-side signOut() will still clear the local session
  return NextResponse.json({
    success: true,
    message: "Déconnexion locale effectuée",
    fallback: true,
  });
}
