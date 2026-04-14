import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { setOtp } from "@/lib/otp-store";
import { validateBody, schemas } from "@/lib/validation";

// SECURITY FIX: Demo mode only in non-production environments.
// In demo mode, uses a fixed predictable code (111111) and logs it server-side.
// NEVER returns the OTP code in the API response — even in demo.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEMO_MODE = !process.env.SMS_API_KEY && !IS_PRODUCTION;
const DEMO_OTP_CODE = "111111"; // Fixed code for demo — check server logs

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

    if (IS_PRODUCTION && !process.env.SMS_API_KEY) {
      // SECURITY: In production, refuse to send OTP if SMS provider is not configured
      console.error("[sms/send-otp] SMS_API_KEY not configured in production. OTP send blocked.");
      return NextResponse.json(
        { error: "Service SMS non configuré. Contactez le support." },
        { status: 503 }
      );
    }

    if (DEMO_MODE) {
      // Demo mode: use fixed code, log server-side, NEVER return in response
      setOtp(phone, DEMO_OTP_CODE);
      console.warn(`[DEMO] SMS OTP for ${phone}: ${DEMO_OTP_CODE}`);
      return NextResponse.json({
        success: true,
        message: "Code envoyé (mode développement)",
        demoMode: true,
        // SECURITY: No demoOtp field — check server logs instead
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

    // Placeholder for production SMS integration
    return NextResponse.json({
      success: true,
      message: "Code envoyé par SMS",
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
