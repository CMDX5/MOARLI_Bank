import { NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

/**
 * Admin Config API — Returns whether admin exists (NOT the email).
 *
 * Security:
 * - Rate limited: max 10 requests per minute
 * - SECURITY FIX: No longer exposes admin email (prevented targeted phishing)
 * - Admin login page is hidden behind a long-press gesture
 */

export async function GET(req: Request) {
  // ── Rate limit ──
  const clientId = getClientId(req as any);
  const rl = rateLimitByIp(`admin:config:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429 }
    );
  }

  const adminEmail = process.env.ADMIN_EMAIL;

  // SECURITY FIX: Only return whether admin is configured, NOT the email
  return NextResponse.json({
    adminConfigured: !!adminEmail,
  });
}
