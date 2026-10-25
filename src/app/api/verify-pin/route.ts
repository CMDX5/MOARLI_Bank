import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { createHash, timingSafeEqual } from "crypto";
// firebase-admin v13: doc/collection/query methods are on the Firestore instance (adminDb)
import { validateBody, schemas } from "@/lib/validation";
import { captureError } from "@/lib/sentry";
import { auditLog, AUDIT_ACTIONS, getClientIp } from "@/lib/audit-log";

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
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "verify-pin", { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 1 minute." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

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
    const pinRef = adminDb.doc("pinRecords/" + auth.uid);
    const snap = await pinRef.get();

    await new Promise((resolve) => setTimeout(resolve, 150));

    if (!snap.exists) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }

    const record = snap.data()!;
    const lockedUntil = Number(record.lockedUntil) || 0;
    if (lockedUntil > Date.now()) {
      return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 1 minute.", valid: false }, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((lockedUntil - Date.now()) / 1000)) },
      });
    }

    const noteFailure = async () => {
      const next = (Number(record.failCount) || 0) + 1;
      await pinRef.set({
        failCount: next,
        lockedUntil: next >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
      }, { merge: true }).catch(() => {});
    };
    const noteSuccess = async () => {
      if (record.failCount || record.lockedUntil) {
        await pinRef.set({ failCount: 0, lockedUntil: 0 }, { merge: true }).catch(() => {});
      }
    };

    // ── Path 1: Modern bcrypt verification ──
    if (record.pinBcrypt) {
      const bcrypt = await import("bcryptjs");
      const isValid = await bcrypt.compare(pin, record.pinBcrypt);

      // Log security event for failed attempts
      if (!isValid) {
        await noteFailure();
        captureError(new Error("PIN verification failed (bcrypt)"), {
          action: "pin:verify:fail",
          route: "/api/verify-pin",
          uid: auth.uid,
          level: "warning",
        });
      } else {
        await noteSuccess();
      }

      auditLog({
        uid: auth.uid!,
        action: isValid ? AUDIT_ACTIONS.PIN_VERIFY_SUCCESS : AUDIT_ACTIONS.PIN_VERIFY_FAILED,
        ip: getClientIp(req),
        level: isValid ? undefined : "warning",
      }).catch(() => {});

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
        await noteFailure();
        return NextResponse.json({ valid: false }, { status: 200 });
      }

      const isValid = timingSafeEqual(bufComputed, bufStored);

      if (isValid) {
        await noteSuccess();
        try {
          const bcrypt = await import("bcryptjs");
          const bcryptHash = await bcrypt.hash(pin, 12);
          await pinRef.update({
            pinBcrypt: bcryptHash,
            migratedAt: new Date().toISOString(),
          });
        } catch (migrationErr) {
          captureError(migrationErr, {
            action: "pin:migrate:fail",
            route: "/api/verify-pin",
            uid: auth.uid ?? undefined,
            level: "error",
          });
        }
      } else {
        await noteFailure();
        captureError(new Error("PIN verification failed (legacy SHA-256)"), {
          action: "pin:verify:fail",
          route: "/api/verify-pin",
          uid: auth.uid,
          level: "warning",
        });
      }

      auditLog({
        uid: auth.uid!,
        action: isValid ? AUDIT_ACTIONS.PIN_VERIFY_SUCCESS : AUDIT_ACTIONS.PIN_VERIFY_FAILED,
        ip: getClientIp(req),
        level: isValid ? undefined : "warning",
      }).catch(() => {});

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
