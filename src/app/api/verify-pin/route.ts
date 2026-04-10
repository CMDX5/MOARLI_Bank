import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { createHash, timingSafeEqual } from "crypto";
import { doc, getDoc } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`verify-pin:${clientId}`, { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 1 minute." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { pin } = body;
  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Code PIN invalide" }, { status: 400 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
  }

  try {
    const pinRef = doc(adminDb, "pinRecords", auth.uid);
    const snap = await getDoc(pinRef);

    // Random delay to prevent timing attacks (applies regardless of record existence)
    const delay = 100 + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!snap.exists()) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }

    const record = snap.data();

    const computedHash = createHash("sha256").update(`${record.salt}:${pin}`).digest("hex");
    const bufComputed = Buffer.from(computedHash, "utf8");
    const bufStored = Buffer.from(record.pinHash, "utf8");

    if (bufComputed.length !== bufStored.length) {
      return NextResponse.json({ valid: false }, { status: 200 });
    }

    const isValid = timingSafeEqual(bufComputed, bufStored);

    return NextResponse.json({ valid: isValid }, {
      status: 200,
      headers: { "X-RateLimit-Remaining": String(rl.remaining) },
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
