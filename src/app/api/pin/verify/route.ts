import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { validateBody, schemas } from "@/lib/validation";

/**
 * POST /api/pin/verify
 *
 * Verifies a PIN against the bcrypt hash stored server-side.
 * Returns the plaintext PIN only if the bcrypt match succeeds.
 *
 * This is used by the "Afficher" flow when the PIN was created
 * before encryption was implemented — the server verifies and
 * returns the PIN so the client can encrypt it for future reveals.
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:verify:${clientId}`, { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
  }

  try {
    const body = await req.json();
    if (!body.pin || !/^\d{4}$/.test(body.pin)) {
      return NextResponse.json({ error: "Code PIN invalide" }, { status: 400 });
    }

    const pinRef = adminDb.doc("pinRecords/" + auth.uid);
    const snap = await pinRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Aucun code PIN enregistré" }, { status: 404 });
    }

    const record = snap.data();
    const pinBcrypt: string | null | undefined = record.pinBcrypt;

    if (!pinBcrypt) {
      // No bcrypt hash — legacy format, try pinHash
      if (record.pinHash && record.salt) {
        return NextResponse.json({ legacy: true, error: "Format hérité non supporté" }, { status: 400 });
      }
      return NextResponse.json({ error: "Aucun code PIN enregistré" }, { status: 404 });
    }

    const bcrypt = await import("bcryptjs");
    const match = await bcrypt.compare(body.pin, pinBcrypt);

    if (!match) {
      return NextResponse.json({ error: "Code PIN incorrect" }, { status: 401 });
    }

    // PIN verified — return plaintext so client can encrypt it
    // (the user has already been authenticated via reauthenticateWithCredential)
    return NextResponse.json({
      success: true,
      pin: body.pin, // Return the PIN since bcrypt matched
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
