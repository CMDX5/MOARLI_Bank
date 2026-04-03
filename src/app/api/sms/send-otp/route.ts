// TODO: Integrate real SMS provider (Twilio, Africa's Talking, Vonage) when API credentials are available
// When SMS provider is active, remove the DEMO_MODE logic below.
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { setOtp } from "@/lib/otp-store";

// Set to true to enable demo mode (returns OTP in response for testing without SMS API)
const DEMO_MODE = true;

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimit(`sms:send-otp:${clientId}`, { maxRequests: 3, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de demandes. Réessayez dans 1 minute." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone || !/^\+242\d{9}$/.test(phone)) {
      return NextResponse.json({ error: "Numéro de téléphone invalide" }, { status: 400 });
    }

    // Generate cryptographically secure 6-digit OTP
    const otp = String(randomInt(100000, 1000000));

    setOtp(phone, otp);

    const response: Record<string, string | boolean> = {
      success: true,
      message: DEMO_MODE ? "Code de test généré (mode démo)" : "Code envoyé par SMS",
      demoOtp: otp, // Returned in demo mode so the app can display it
      demoMode: DEMO_MODE,
    };

    // OTP logged only in non-production environments for debugging
    if (process.env.NODE_ENV !== "production") {
      console.log(`[OTP DEMO] Phone: ${phone}, Code: ${otp}`);
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
