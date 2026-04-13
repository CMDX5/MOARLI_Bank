import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp-store";
import { validateBody, schemas } from "@/lib/validation";

/**
 * Verify the reset code (OTP) sent by email.
 * Must be called before /api/auth/reset-password.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`auth:verify-reset:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  try {
    const rawBody = await req.json();
    const validation = validateBody(schemas.emailVerifyOtp, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { email, code } = validation.data;

    const result = await verifyOtp(`reset:${email}`, code);

    switch (result) {
      case "valid":
        return NextResponse.json({ valid: true });
      case "invalid":
        return NextResponse.json({ valid: false, error: "Code incorrect" });
      case "expired":
        return NextResponse.json({ valid: false, error: "Code expiré. Demandez un nouveau code." });
      case "max_attempts":
        return NextResponse.json({ valid: false, error: "Trop de tentatives. Demandez un nouveau code." });
      case "not_found":
        return NextResponse.json({ valid: false, error: "Aucun code en attente. Demandez un nouveau code." });
      default:
        return NextResponse.json({ valid: false, error: "Erreur de vérification" });
    }
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
