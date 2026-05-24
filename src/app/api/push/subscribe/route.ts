import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "push:subscribe", { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const { subscription } = body;

    if (!subscription || typeof subscription !== "object") {
      return NextResponse.json({ error: "Subscription invalide" }, { status: 400 });
    }

    // Validate required PushSubscription fields
    const { endpoint, keys } = subscription as { endpoint?: string; keys?: Record<string, string> };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Subscription incomplète" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
    }

    const docRef = adminDb.collection("users").doc(auth.uid).collection("pushSubscription").doc("current");
    await docRef.set({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe] POST error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service de base de données indisponible" }, { status: 503 });
    }

    const docRef = adminDb.collection("users").doc(auth.uid).collection("pushSubscription").doc("current");
    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[push/subscribe] DELETE error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
