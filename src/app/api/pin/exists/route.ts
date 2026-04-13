import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * GET /api/pin/exists
 *
 * Checks if the authenticated user has a PIN stored.
 * Uses admin SDK to bypass Firestore security rules.
 * This is needed because the client SDK may not have read access to pinRecords.
 */
export async function GET(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:exists:${clientId}`, { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ exists: false, error: "Service indisponible" }, { status: 503 });
  }

  try {
    const pinRef = adminDb.doc("pinRecords/" + auth.uid);
    const snap = await pinRef.get();

    if (snap.exists) {
      const data = snap.data()!;
      return NextResponse.json({
        exists: true,
        hasServerEncrypted: !!data.serverEncryptedPin,
        hasBcrypt: !!data.pinBcrypt,
      });
    }

    return NextResponse.json({ exists: false });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
