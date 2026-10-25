import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { getAdminAuth } from "@/lib/auth-verify";
import { validateBody, schemas } from "@/lib/validation";
import { consumeResetToken } from "@/lib/otp-store";
import { revokeUserTokens } from "@/lib/auth-verify";

/**
 * Reset the user's account password using Firebase Admin SDK.
 * SECURITY FIX: Now requires a valid resetToken obtained after OTP verification.
 * Without this token, the password reset is rejected.
 *
 * Flow:
 * 1. User requests OTP via POST /api/email/send-otp
 * 2. User verifies OTP via POST /api/auth/verify-reset-code (returns resetToken)
 * 3. User resets password via POST /api/auth/reset-password (requires resetToken)
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`auth:reset-pw:${clientId}`, { maxRequests: 2, windowSec: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 5 minutes." }, { status: 429 });
  }

  try {
    const rawBody = await req.json();
    const validation = validateBody(schemas.authResetPassword, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { email, newPassword } = validation.data;

    const adminAuth = await getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json({ error: "Service indisponible. Contactez le support." }, { status: 503 });
    }

    // Token is bound to the email that verified the OTP and is single-use.
    const resetToken = rawBody.resetToken;
    if (!resetToken || typeof resetToken !== "string" || !(await consumeResetToken(resetToken, email))) {
      return NextResponse.json(
        { error: "Jeton de réinitialisation invalide ou expiré. Veuillez vérifier votre code OTP d'abord." },
        { status: 403 }
      );
    }

    // Same response whether or not an account exists — no email enumeration.
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      await adminAuth.updateUser(userRecord.uid, { password: newPassword });
      await revokeUserTokens(userRecord.uid);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code || "") : "";
      const missing = code === "auth/user-not-found" || message.includes("user-not-found") || message.includes("no user record");
      if (!missing) {
        console.error("[auth/reset-password] Error:", err);
        return NextResponse.json({ error: "Erreur lors de la réinitialisation" }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
