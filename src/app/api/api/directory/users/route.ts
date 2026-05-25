import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * GET /api/directory/users
 * Admin-only: returns a paginated list of all registered users.
 * Used by the AdminDashboard to populate the user management table.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "admin:users:list", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const page = parseInt(req.nextUrl.searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 100);
    const offset = (page - 1) * limit;

    const snapshot = await adminDb
      .collection("moraliUsers")
      .orderBy("createdAt", "desc")
      .offset(offset)
      .limit(limit)
      .get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        fullName: data.fullName || "",
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        pseudo: data.pseudo || "",
        moraliId: data.moraliId || "",
        rib: data.rib || "",
        email: data.email || "",
        phone: data.phone || "",
        balance: typeof data.balance === "number" ? data.balance : 0,
        savingsBalance: typeof data.savingsBalance === "number" ? data.savingsBalance : 0,
        accountStatus: data.accountStatus || "active",
        role: data.role || "user",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
      };
    });

    return NextResponse.json({ users, page, limit, count: users.length });
  } catch (err) {
    console.error("[directory/users]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
