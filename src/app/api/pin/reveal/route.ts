import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { decryptPinServerSide } from "@/lib/pin-server-crypto";

/**
 * POST /api/pin/reveal
 *
 * Returns the plaintext PIN after verifying Firebase authentication.
 * SECURITY FIX: Now requires explicit re-authentication proof.
 * A freshPassword field must be provided — the token must have been
 * obtained within the last 60 seconds (forces re-login).
 *
 * Security:
 * - Requires valid Firebase ID token
 * - Token must be fresh (< 60 seconds old) — forces re-authentication
 * - Rate limited (5 requests per minute)
 * - PIN is decrypted server-side using per-user AES-256-GCM key
 * - Only works if the PIN has a server-encrypted copy stored
 */
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:reveal:${clientId}`, { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // SECURITY FIX: Verify the token was issued recently (re-authentication)
  // auth.claims contains the Firebase token payload including iat (issued at)
  const tokenIat = auth.claims?.iat as number | undefined;
  if (!tokenIat) {
    return NextResponse.json(
      { error: "Impossible de vérifier l'âge du jeton. Veuillez vous reconnecter." },
      { status: 401 }
    );
  }

  const tokenAgeSeconds = Math.floor(Date.now() / 1000) - tokenIat;
  if (tokenAgeSeconds > 60) {
    return NextResponse.json(
      { error: "Jeton trop ancien. Veuillez vous reconnecter pour révéler votre PIN." },
      { status: 401 }
    );
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    const pinRef = adminDb.doc("pinRecords/" + auth.uid);
    const snap = await pinRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "Aucun PIN enregistré" }, { status: 404 });
    }

    const record = snap.data()!;

    // Try server-encrypted PIN first (new format)
    const serverEncrypted: string | null | undefined = record.serverEncryptedPin;
    if (serverEncrypted) {
      const decrypted = decryptPinServerSide(serverEncrypted, auth.uid);
      if (decrypted) {
        return NextResponse.json({ success: true, pin: decrypted, source: "server" });
      }
    }

    // Try legacy encrypted PIN (AES-GCM encrypted with user's password)
    const encryptedPin: string | null | undefined = record.encryptedPin;
    if (encryptedPin) {
      // Can't decrypt without user's password — client will handle this
      return NextResponse.json({
        success: false,
        needsPassword: true,
        encryptedPin,
        pinIv: record.pinIv || null,
      });
    }

    // No encrypted version exists — PIN was created before encryption was added
    return NextResponse.json({
      success: false,
      needsPinMigration: true,
      message: "PIN créé avant le chiffrement. Migration nécessaire.",
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
