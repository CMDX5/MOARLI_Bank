import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { doc, setDoc } from "firebase-admin/firestore";

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
    // Admin SDK not available — return success but tell client to store locally
    return NextResponse.json({ success: true, fallback: true }, { status: 200 });
  }

  try {
    const body = await req.json();
    const { encryptedPin, pinIv, pinHash, salt } = body;

    if (!pinHash || !salt) {
      return NextResponse.json({ error: "Données PIN manquantes" }, { status: 400 });
    }

    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    await setDoc(pinRef, {
      pinHash,
      salt,
      encryptedPin: encryptedPin || null,
      pinIv: pinIv || null,
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true, fallback: true });
  }
}
