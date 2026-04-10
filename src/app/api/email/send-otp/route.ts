import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { setOtp } from "@/lib/otp-store";

// Set to true to enable demo mode (returns OTP in response for testing without Resend API)
const DEMO_MODE = !process.env.RESEND_API_KEY;

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`email:send-otp:${clientId}`, { maxRequests: 3, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de demandes. Réessayez dans 1 minute." }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    // Generate cryptographically secure 6-digit code
    const code = String(randomInt(100000, 1000000));
    setOtp(`email:${email}`, code);

    if (DEMO_MODE) {
      // Demo mode: return code in response
      // SECURITY: OTP code never logged in any environment
      return NextResponse.json({
        success: true,
        message: "Code de test généré (mode démo)",
        demoOtp: code,
        demoMode: true,
      });
    }

    // Production: send via Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Morali <onboarding@resend.dev>",
      to: email,
      subject: "Code de confirmation Morali",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0a0e17; border-radius: 16px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #D4A437; font-size: 24px; margin: 0;">Morali</h1>
            <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Sécurité de votre compte</p>
          </div>
          <div style="background: rgba(212,164,55,0.06); border: 1px solid rgba(212,164,55,0.15); border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px;">Votre code de confirmation est :</p>
            <div style="font-size: 36px; font-weight: 900; letter-spacing: 0.2em; color: #fff;">${code}</div>
          </div>
          <p style="color: #64748b; font-size: 12px; text-align: center; line-height: 1.6;">
            Ce code expire dans 5 minutes. Ne le partagez avec personne.<br/>
            Si vous n'avez pas demandé ce code, ignorez cet email.
          </p>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center;">
            <p style="color: #475569; font-size: 11px; margin: 0;">&copy; Morali — Votre espace financier digital</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("[Resend] Error sending email:", error);
      return NextResponse.json({ error: "Erreur d'envoi de l'email. Réessayez." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Code envoyé par email",
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
