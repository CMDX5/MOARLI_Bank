import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAuth } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/notifications/count
 * Returns the number of unread notifications for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "notif:count", { maxRequests: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ count: 0 });
    }

    const snapshot = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("notifications")
      .where("read", "==", false)
      .count()
      .get();

    return NextResponse.json({ count: snapshot.data().count });
  } catch (err) {
    console.error("[notifications/count]", err);
    return NextResponse.json({ count: 0 });
  }
}
