import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

export async function POST(req: NextRequest) {
  // SECURITY: Firebase Custom Claims
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "admin:delete-user", { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Get Admin Firestore
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  try {
    const { uid } = await req.json();
    if (!uid || typeof uid !== "string") {
      return NextResponse.json({ error: "UID requis" }, { status: 400 });
    }

    // Prevent admin from deleting themselves
    if (uid === auth.uid) {
      return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });
    }

    // 1. Delete Firestore user doc + subcollections
    try {
      // Delete user profile
      await adminDb.collection("moraliUsers").doc(uid).delete();

      // Delete PIN record
      try {
        await adminDb.collection("pinRecords").doc(uid).delete();
      } catch {
        // PIN record may not exist, ignore
      }

      // Delete KYC record
      try {
        await adminDb.collection("kycRecords").doc(uid).delete();
      } catch {
        // KYC record may not exist, ignore
      }

      // Delete sent transactions
      const txSnap = await adminDb.collection("transactions")
        .where("senderUid", "==", uid).get();
      const batch1 = adminDb.batch();
      txSnap.docs.forEach((d) => batch1.delete(d.ref));
      if (txSnap.size > 0) await batch1.commit();

      // Delete received transactions
      const txSnap2 = await adminDb.collection("transactions")
        .where("recipientUid", "==", uid).get();
      const batch2 = adminDb.batch();
      txSnap2.docs.forEach((d) => batch2.delete(d.ref));
      if (txSnap2.size > 0) await batch2.commit();

      // Delete notifications subcollection
      const notifSnap = await adminDb.collection("users", uid, "notifications").get();
      const batch3 = adminDb.batch();
      notifSnap.docs.forEach((d) => batch3.delete(d.ref));
      if (notifSnap.size > 0) await batch3.commit();

      // Delete support tickets subcollection
      const supportSnap = await adminDb.collection("users", uid, "supportTickets").get();
      const batch4 = adminDb.batch();
      supportSnap.docs.forEach((d) => batch4.delete(d.ref));
      if (supportSnap.size > 0) await batch4.commit();
    } catch (fsErr) {
      console.error("[admin/delete-user] Firestore cleanup error:", fsErr);
    }

    // 2. Disable Firebase Auth account (prevents re-login)
    try {
      const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
      const { getApps } = await import("firebase-admin/app");
      const adminApp = getApps()[0];
      if (adminApp) {
        const adminAuth = getAdminAuth(adminApp);
        await adminAuth.disableUser(uid);
      }
    } catch (authErr) {
      console.error("[admin/delete-user] Auth disable error:", authErr);
    }

    return NextResponse.json({ success: true, deleted: uid });
  } catch (error) {
    console.error("[admin/delete-user] Error:", error);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
