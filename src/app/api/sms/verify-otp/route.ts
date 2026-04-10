import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp-store";

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`sms:verify-otp:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { phone, code } = body;

    if (!phone || !code || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Code invalide" }, { status: 400 });
    }

    const result = verifyOtp(phone, code);

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
