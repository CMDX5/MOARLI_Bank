import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { doc, getDoc } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`pin:get-encrypted:${clientId}`, { maxRequests: 5, windowSec: 60 });
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
    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    const snap = await getDoc(pinRef);

    if (!snap.exists()) {
      return NextResponse.json(
        { hasEncrypted: false, message: "Code PIN créé avant la mise à jour. Veuillez le modifier." },
        { status: 200 }
      );
    }

    const record = snap.data();
    const encryptedPin: string | null | undefined = record.encryptedPin;
    const pinIv: string | null | undefined = record.pinIv;

    if (!encryptedPin || !pinIv) {
      return NextResponse.json(
        { hasEncrypted: false, message: "Code PIN créé avant la mise à jour. Veuillez le modifier." },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { hasEncrypted: true, encryptedPin, pinIv },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
