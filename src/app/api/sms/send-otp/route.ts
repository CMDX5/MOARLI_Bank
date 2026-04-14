import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { setOtp } from "@/lib/otp-store";
import { validateBody, schemas } from "@/lib/validation";

// DEMO MODE: Active when no SMS_API_KEY is configured.
// In development: automatically enabled.
// In production: enabled ONLY if ALLOW_DEMO_OTP=true (env var on Vercel).
// When a real SMS provider is configured (SMS_API_KEY), demo mode is disabled.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const HAS_SMS_PROVIDER = !!process.env.SMS_API_KEY;
const DEMO_MODE = !HAS_SMS_PROVIDER && (!IS_PRODUCTION || process.env.ALLOW_DEMO_OTP === "true");
const DEMO_OTP_CODE = "111111";

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

    // Production without provider AND without demo override → block
    if (IS_PRODUCTION && !HAS_SMS_PROVIDER && !DEMO_MODE) {
      console.error("[sms/send-otp] SMS_API_KEY not configured and ALLOW_DEMO_OTP not enabled. OTP send blocked.");
      return NextResponse.json(
        { error: "Service SMS non configuré. Contactez le support." },
        { status: 503 }
      );
    }

    if (DEMO_MODE) {
      setOtp(phone, DEMO_OTP_CODE);
      console.warn(`[DEMO] SMS OTP for ${phone}: ${DEMO_OTP_CODE}`);
      return NextResponse.json({
        success: true,
        message: "Code envoyé (mode développement)",
        demoMode: true,
        demoOtp: DEMO_OTP_CODE,
      });
    }

    // Production: generate cryptographically secure 6-digit code
    const code = String(randomInt(100000, 1000000));
    setOtp(phone, code);

    // Production: send via SMS provider (e.g., Twilio, Vonage)
    // Example with Twilio:
    // const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await twilio.messages.create({
    //   body: `Votre code Morali est: ${code}. Il expire dans 5 minutes.`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phone,
    // });

    return NextResponse.json({
      success: true,
      message: "Code envoyé par SMS",
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
