import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { doc, setDoc } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:reset:${clientId}`, { maxRequests: 3, windowSec: 300 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 5 minutes." }, { status: 429 });
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
    const { pinHash, salt, encryptedPin, pinIv } = body;

    if (!pinHash || !salt) {
      return NextResponse.json({ error: "Données PIN manquantes" }, { status: 400 });
    }

    // Update PIN record in Firestore
    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    await setDoc(pinRef, {
      pinHash,
      salt,
      encryptedPin: encryptedPin || null,
      pinIv: pinIv || null,
      resetAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
