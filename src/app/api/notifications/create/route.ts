import { NextRequest, NextResponse } from "next/server";
// firebase-admin v13: doc/collection/query methods are on the Firestore instance (adminDb)
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

export async function POST(req: NextRequest) {
  // Auth
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "notif:create", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const body = await req.json();
    const { uid, title, time, badge, badgeClass, icon, bg } = body;

    if (!uid || !title) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    // SECURITY FIX: Only admin can send cross-user notifications.
    // Regular users can only send notifications to themselves.
    const isAdmin = auth.claims?.admin === true;
    let targetUid: string;

    if (isAdmin) {
      // Admin can send to any user
      targetUid = String(uid);
    } else {
      // Regular user: force targetUid to own UID (prevent IDOR)
      targetUid = auth.uid;
      if (String(uid) !== auth.uid) {
        return NextResponse.json(
          { error: "Interdit — vous ne pouvez envoyer des notifications qu'à vous-même" },
          { status: 403 }
        );
      }
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      // Fallback: write directly via client Firestore (only to own notifications)
      return NextResponse.json({ success: true, fallback: true });
    }

    const sanitize = (s: string) => String(s || "")
      .slice(0, 200)
      .replace(/<[^>]*>/g, "")    // Strip HTML tags
      .replace(/&[^;]+;/g, "")    // Strip HTML entities
      .replace(/['"\\]/g, "");    // Strip quotes and backslashes

    await adminDb.collection("users/" + targetUid + "/notifications").add({
      title: sanitize(title),
      time: sanitize(time || "À l'instant"),
      badge: sanitize(badge || "Info"),
      badgeClass: sanitize(badgeClass || "nb-blue"),
      icon: sanitize(icon || "bell"),
      bg: sanitize(bg || "rgba(59,130,246,0.12)"),
      read: false,
      createdAt: new Date(),
      // Track sender for audit
      sentBy: isAdmin ? "admin" : "self",
      senderUid: auth.uid,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[notifications/create]", err);
    return NextResponse.json({ success: true, fallback: true }); // Don't block transfer
  }
}
