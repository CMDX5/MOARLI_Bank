import { NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

/**
 * Admin Config API — Returns the admin email for the login form.
 *
 * Security:
 * - Rate limited: max 10 requests per minute
 * - Only exposes the admin email (not a secret — login still requires password)
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

  if (!adminEmail) {
    return NextResponse.json(
      { error: "Configuration admin non définie" },
      { status: 503 }
    );
  }

  return NextResponse.json({ email: adminEmail });
}
