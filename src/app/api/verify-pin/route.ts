import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { createHash, timingSafeEqual } from "crypto";
import { doc, getDoc, updateDoc } from "firebase-admin/firestore";
import { validateBody, schemas } from "@/lib/validation";
import { captureError } from "@/lib/sentry";

/**
 * POST /api/verify-pin
 *
 * Verifies a 4-digit PIN against the stored hash.
 *
 * Migration strategy:
 * 1. If `pinBcrypt` field exists → use bcrypt comparison (modern path)
 * 2. If only `pinHash` + `salt` (legacy SHA-256) → verify with SHA-256, then
 *    asynchronously re-hash with bcrypt and update Firestore (one-time migration)
 *
 * This ensures zero-downtime migration: existing users keep working while
 * new PINs are stored with bcrypt from the start.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`verify-pin:${clientId}`, { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 1 minute." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const validation = validateBody(schemas.verifyPin, rawBody);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { pin } = validation.data;

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
  }

  try {
    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    const snap = await getDoc(pinRef);

    // Random delay to prevent timing attacks (regardless of record existence)
    const delay = 100 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!snap.exists()) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }

    const record = snap.data();

    // ── Path 1: Modern bcrypt verification ──
    if (record.pinBcrypt) {
      const bcrypt = await import("bcryptjs");
      const isValid = await bcrypt.compare(pin, record.pinBcrypt);

      // Log security event for failed attempts
      if (!isValid) {
        captureError(new Error("PIN verification failed (bcrypt)"), {
          action: "pin:verify:fail",
          route: "/api/verify-pin",
          uid: auth.uid,
          level: "warning",
        });
      }

      return NextResponse.json({ valid: isValid }, {
        status: 200,
        headers: { "X-RateLimit-Remaining": String(rl.remaining) },
      });
    }

    // ── Path 2: Legacy SHA-256 verification + automatic migration ──
    if (record.pinHash && record.salt) {
      const computedHash = createHash("sha256").update(`${record.salt}:${pin}`).digest("hex");
      const bufComputed = Buffer.from(computedHash, "utf8");
      const bufStored = Buffer.from(record.pinHash, "utf8");

      if (bufComputed.length !== bufStored.length) {
        return NextResponse.json({ valid: false }, { status: 200 });
      }

      const isValid = timingSafeEqual(bufComputed, bufStored);

      if (isValid) {
        // ── Migrate: re-hash PIN with bcrypt and update Firestore ──
        // Fire-and-forget — don't block the response
        (async () => {
          try {
            const bcrypt = await import("bcryptjs");
            const bcryptHash = await bcrypt.hash(pin, 12);
            await updateDoc(pinRef, {
              pinBcrypt: bcryptHash,
              migratedAt: new Date().toISOString(),
            });
            console.log(`[pin:migrate] uid=${auth.uid} SHA-256 → bcrypt migration complete`);
          } catch (migrationErr) {
            captureError(migrationErr, {
              action: "pin:migrate:fail",
              route: "/api/verify-pin",
              uid: auth.uid,
              level: "error",
            });
          }
        })();
      } else {
        captureError(new Error("PIN verification failed (legacy SHA-256)"), {
          action: "pin:verify:fail",
          route: "/api/verify-pin",
          uid: auth.uid,
          level: "warning",
        });
      }

      return NextResponse.json({ valid: isValid }, {
        status: 200,
        headers: { "X-RateLimit-Remaining": String(rl.remaining) },
      });
    }

    // No valid hash found
    return NextResponse.json({ valid: false }, { status: 200 });
  } catch (err) {
    captureError(err, { action: "pin:verify:error", route: "/api/verify-pin", uid: auth.uid, level: "error" });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
