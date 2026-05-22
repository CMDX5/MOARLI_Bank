import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAuth } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/notifications/list
 * Returns all notifications for the authenticated user, newest first.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "notif:list", { maxRequests: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ notifications: [] });
    }

    const snapshot = await adminDb
      .collection("users")
      .doc(auth.uid)
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const notifications = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || "",
        time: data.time || "",
        badge: data.badge || "Info",
        badgeClass: data.badgeClass || "nb-blue",
        icon: data.icon || "bell",
        bg: data.bg || "rgba(59,130,246,0.12)",
        read: data.read === true,
      };
    });

    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[notifications/list]", err);
    return NextResponse.json({ notifications: [] });
  }
}
