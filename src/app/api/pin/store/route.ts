import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { doc, setDoc } from "firebase-admin/firestore";
import { validateBody, schemas } from "@/lib/validation";
import { captureError, captureSecurityEvent } from "@/lib/sentry";

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
    const rawBody = await req.json();
    const validation = validateBody(schemas.pinStore, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { encryptedPin, pinIv, pinHash, salt } = validation.data;

    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    await setDoc(pinRef, {
      pinHash,
      salt,
      encryptedPin: encryptedPin || null,
      pinIv: pinIv || null,
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    captureError(err, { action: "pin:store", route: "/api/pin/store", uid: auth.uid, level: "error" });
    return NextResponse.json({ success: true, fallback: true });
  }
}
