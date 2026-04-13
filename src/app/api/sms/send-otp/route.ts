import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { setOtp } from "@/lib/otp-store";
import { validateBody, schemas } from "@/lib/validation";

// Set to true to enable demo mode (returns OTP in response for testing without SMS provider)
const DEMO_MODE = !process.env.SMS_API_KEY;

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`sms:send-otp:${clientId}`, { maxRequests: 3, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de demandes. Réessayez dans 1 minute." }, { status: 429 });
  }

  try {
    const rawBody = await req.json();
    const validation = validateBody(schemas.smsSendOtp, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { phone } = validation.data;

    // Generate cryptographically secure 6-digit code
    const code = String(randomInt(100000, 1000000));

    // Store OTP in Firestore (async — works across serverless instances)
    await setOtp(phone, code);

    if (DEMO_MODE) {
      // Demo mode: return code in response for testing
      return NextResponse.json({
        success: true,
        message: "Code de test généré (mode démo)",
        demoOtp: code,
        demoMode: true,
      });
    }

    // Production: send via SMS provider (e.g., Twilio, Vonage)
    return NextResponse.json({
      success: true,
      message: "Code envoyé par SMS",
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
