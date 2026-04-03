import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { Firestore } from "firebase-admin/firestore";

/** Verify caller has admin role in Firestore. Returns true if admin, false otherwise. */
async function verifyAdminRole(uid: string, adminDb: Firestore): Promise<boolean> {
  try {
    const userDoc = await adminDb.collection("moraliUsers").doc(uid).get();
    return userDoc.data()?.role === "admin";
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  // Security: Only admins can view audit logs
  if (!(await verifyAdminRole(auth.uid || "", adminDb))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);

  try {
    const logsSnap = await adminDb
      .collection("adminAuditLog")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    const logs = logsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("[admin/audit-log] Error:", error);
    return NextResponse.json({ logs: [] });
  }
}

export async function POST(req: NextRequest) {
  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  // Security: Only admins can write audit logs
  if (!(await verifyAdminRole(auth.uid || "", adminDb))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  try {
    const { action, target, details } = await req.json();
    const docRef = await adminDb.collection("adminAuditLog").add({
      adminUid: auth.uid || "unknown",
      adminName: "",
      action: String(action || "").slice(0, 100),
      target: String(target || "").slice(0, 100),
      details: String(details || "").slice(0, 500),
      createdAt: new Date(),
    });
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error("[admin/audit-log] Error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
