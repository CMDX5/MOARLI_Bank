import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

export async function GET(req: NextRequest) {
  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  // SECURITY: Firebase Custom Claims — not forgeable by client
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

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

  // SECURITY: Firebase Custom Claims
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

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
