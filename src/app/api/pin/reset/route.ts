import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { doc, setDoc } from "firebase-admin/firestore";
import { validateBody, schemas } from "@/lib/validation";
import { captureError } from "@/lib/sentry";

/**
 * POST /api/pin/reset
 *
 * Resets a PIN. The client sends a plaintext PIN; the server
 * hashes it with bcrypt (work factor 12) before storing.
 *
 * Accepts both new format (plaintext pin) and legacy format (pinHash+salt)
 * for backward compatibility during migration.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "pin:reset", { maxRequests: 3, windowSec: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 5 minutes." }, { status: 429 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
  }

  try {
    const rawBody = await req.json();

    // Accept both new (pin) and legacy (pinHash+salt) formats
    const isNewFormat = rawBody.pin && /^\d{4}$/.test(rawBody.pin);

    if (isNewFormat) {
      // ── New format: bcrypt-hash the plaintext PIN server-side ──
      const bcrypt = await import("bcryptjs");
      const pinBcrypt = await bcrypt.hash(rawBody.pin, 12);

      const pinRef = doc(adminDb, "pinRecords", auth.uid);
      await setDoc(pinRef, {
        pinBcrypt,
        // Keep encrypted PIN fields if provided (for PIN reveal feature)
        encryptedPin: rawBody.encryptedPin || null,
        pinIv: rawBody.pinIv || null,
        resetAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return NextResponse.json({ success: true, bcrypt: true });
    }

    // ── Legacy format: store as-is (SHA-256 hash from old client) ──
    const validation = validateBody(schemas.pinResetLegacy, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { pinHash, salt, encryptedPin, pinIv } = validation.data;

    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    await setDoc(pinRef, {
      pinHash,
      salt,
      encryptedPin: encryptedPin || null,
      pinIv: pinIv || null,
      resetAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ success: true, legacy: true });
  } catch (err) {
    captureError(err, { action: "pin:reset", route: "/api/pin/reset", uid: auth.uid, level: "error" });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
