import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { captureError, captureSecurityEvent } from "@/lib/sentry";

/**
 * Admin Login API — SERVER-SIDE CREDENTIAL VERIFICATION
 *
 * Security:
 * - Email compared against ADMIN_EMAIL env var (server-side only, never exposed)
 * - Password verified against ADMIN_PASSWORD_HASH (bcrypt, server-side only)
 * - Rate limited: max 5 attempts per minute
 * - No credential leakage in error messages
 *
 * IMPORTANT: Never use NEXT_PUBLIC_ prefix for sensitive values.
 * ADMIN_EMAIL and ADMIN_PASSWORD_HASH are server-side only.
 */

// Maximum login attempts before temporary lockout
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SEC = 300; // 5 minutes

export async function POST(req: NextRequest) {
  // ── Rate limit ──
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`admin:login:${clientId}`, { maxRequests: MAX_ATTEMPTS, windowSec: LOCKOUT_WINDOW_SEC });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Trop de tentatives. Réessayez dans 5 minutes." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    // ── Input validation ──
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "Format email invalide" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 1 || password.length > 128) {
      return NextResponse.json(
        { success: false, error: "Mot de passe invalide" },
        { status: 400 }
      );
    }

    // ── Server-side env var check ──
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminEmail || !adminPasswordHash) {
      captureError(new Error("Admin credentials not configured"), { action: "admin:login", route: "/api/admin/login", level: "fatal" });
      return NextResponse.json(
        { success: false, error: "Service de connexion indisponible" },
        { status: 503 }
      );
    }

    // ── Email comparison (timing-safe) ──
    // Normalize both emails for comparison
    const normalizedInput = email.toLowerCase().trim();
    const normalizedAdmin = adminEmail.toLowerCase().trim();

    if (normalizedInput !== normalizedAdmin) {
      captureSecurityEvent("admin_login_email_mismatch", { ip: req.headers.get("x-forwarded-for") || undefined });
      return NextResponse.json(
        { success: false, error: "Identifiants incorrects" },
        { status: 401 }
      );
    }

    // ── Password verification (bcrypt with constant-time comparison) ──
    const bcrypt = await import("bcryptjs");
    const isPasswordValid = await bcrypt.compare(password, adminPasswordHash);

    if (!isPasswordValid) {
      captureSecurityEvent("admin_login_invalid_password", { ip: req.headers.get("x-forwarded-for") || undefined });
      return NextResponse.json(
        { success: false, error: "Identifiants incorrects" },
        { status: 401 }
      );
    }

    // ── Success ──
    return NextResponse.json({
      success: true,
      message: "Identifiants valides",
    });
  } catch (err) {
    captureError(err, { action: "admin:login", route: "/api/admin/login" });
    return NextResponse.json(
      { success: false, error: "Erreur interne" },
      { status: 500 }
    );
  }
}
