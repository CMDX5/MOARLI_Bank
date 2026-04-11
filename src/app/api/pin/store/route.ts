import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
// firebase-admin v13: doc/collection/query methods are on the Firestore instance (adminDb)
import { validateBody, schemas } from "@/lib/validation";
import { captureError } from "@/lib/sentry";

/**
 * POST /api/pin/store
 *
 * Stores a PIN hash. The client sends a plaintext PIN; the server
 * hashes it with bcrypt (work factor 12) before storing.
 *
 * Accepts both new format (plaintext pin) and legacy format (pinHash+salt)
 * for backward compatibility during migration.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:store:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ success: true, fallback: true }, { status: 200 });
  }

  try {
    const rawBody = await req.json();

    // Accept both new (pin) and legacy (pinHash+salt) formats
    const isNewFormat = rawBody.pin && /^\d{4}$/.test(rawBody.pin);

    if (isNewFormat) {
      // ── New format: bcrypt-hash the plaintext PIN server-side ──
      const bcrypt = await import("bcryptjs");
      const pinBcrypt = await bcrypt.hash(rawBody.pin, 12);

      const pinRef = adminDb.doc("pinRecords/" + auth.uid);
      await pinRef.set({
        pinBcrypt,
        // Keep encrypted PIN fields if provided (for PIN reveal feature)
        encryptedPin: rawBody.encryptedPin || null,
        pinIv: rawBody.pinIv || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return NextResponse.json({ success: true, bcrypt: true });
    }

    // ── Legacy format: store as-is (SHA-256 hash from old client) ──
    const validation = validateBody(schemas.pinStoreLegacy, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { encryptedPin, pinIv, pinHash, salt } = validation.data;

    const pinRef = adminDb.doc("pinRecords/" + auth.uid);
    await pinRef.set({
      pinHash,
      salt,
      encryptedPin: encryptedPin || null,
      pinIv: pinIv || null,
    }, { merge: true });

    return NextResponse.json({ success: true, legacy: true });
  } catch (err) {
    captureError(err, { action: "pin:store", route: "/api/pin/store", uid: auth.uid, level: "error" });
    return NextResponse.json({ success: true, fallback: true });
  }
}
