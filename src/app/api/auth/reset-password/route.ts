import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { getAdminAuth } from "@/lib/auth-verify";

/**
 * Reset the user's account password using Firebase Admin SDK.
 * The caller must have already verified the OTP code.
 * No auth token required — uses email to identify the user.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`auth:reset-pw:${clientId}`, { maxRequests: 2, windowSec: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 5 minutes." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { email, newPassword } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
    }

    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json({ error: "Service indisponible. Contactez le support." }, { status: 503 });
    }

    // Get user by email
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      // Update the password
      await adminAuth.updateUser(userRecord.uid, { password: newPassword });
      return NextResponse.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("auth/user-not-found")) {
        return NextResponse.json({ error: "Aucun compte trouvé avec cet email" }, { status: 404 });
      }
      console.error("[auth/reset-password] Error:", err);
      return NextResponse.json({ error: "Erreur lors de la réinitialisation" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
