import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * GET /api/admin/fetch-data
 *
 * Returns ALL admin dashboard data in a single request:
 * - Users from moraliUsers (excludes admins)
 * - Transactions from both "transactions" and "serverTransactions" collections
 *
 * Uses Admin SDK (bypasses Firestore security rules).
 * This ensures the admin dashboard always sees the latest data,
 * including users created via Admin API and transactions from server-side endpoints.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Service indisponible" },
        { status: 503 }
      );
    }

    // 1. Fetch all users (excluding admins)
    const usersSnap = await adminDb.collection("moraliUsers").get();
    const users = usersSnap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u: Record<string, unknown>) => u.role !== "admin");

    // 2. Fetch transactions from BOTH collections
    const [txSnap, serverTxSnap] = await Promise.all([
      adminDb.collection("transactions").get(),
      adminDb.collection("serverTransactions").get(),
    ]);

    // Merge transactions, deduplicate by receiptId
    const seen = new Map<string, boolean>();
    const allTxs: Array<Record<string, unknown>> = [];

    for (const snap of [txSnap, serverTxSnap]) {
      for (const doc of snap.docs) {
        const data = { id: doc.id, ...doc.data() } as Record<string, unknown>;
        // Filter out directory entries
        if (data.type === "__directory__" || data.status === "directory") continue;

        // Deduplicate by receiptId (if present)
        const receiptId = String(data.receiptId || "");
        if (receiptId && seen.has(receiptId)) continue;
        if (receiptId) seen.set(receiptId, true);

        allTxs.push(data);
      }
    }

    // Sort by createdAt descending (newest first)
    allTxs.sort((a, b) => {
      const getTs = (val: unknown) => {
        if (!val) return 0;
        if (val instanceof Date) return val.getTime();
        if (typeof val === "number") return val * (val < 1e12 ? 1000 : 1); // seconds vs ms
        if (typeof val === "object" && "seconds" in (val as object)) {
          return (val as { seconds: number }).seconds * 1000;
        }
        if (typeof val === "string") return new Date(val).getTime();
        return 0;
      };
      return getTs(b.createdAt) - getTs(a.createdAt);
    });

    return NextResponse.json({
      success: true,
      users,
      transactions: allTxs,
      meta: {
        userCount: users.length,
        transactionCount: allTxs.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[admin/fetch-data] Error:", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des données" },
      { status: 500 }
    );
  }
}
