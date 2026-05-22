import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAdmin } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/revenue
 *
 * Returns bank revenue data for the admin dashboard:
 * - Total revenue (today, this month, all time)
 * - Breakdown by revenue type
 * - Recent revenue entries
 * - Optional period filter: ?period=today|month|year|all
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "admin:revenue", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    const url = new URL(req.url);
    const period = url.searchParams.get("period") || "month";

    // Calculate time boundaries
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        break;
      case "month":
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        break;
    }

    // Query all revenue entries (period-filtered)
    const revenueRef = adminDb.collection("bankRevenue");
    const snapshot = await revenueRef
      .where("createdAt", ">=", startDate)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    // Also get total all-time
    const allSnapshot = await revenueRef.orderBy("createdAt", "desc").limit(2000).get();

    // Process entries
    let totalAmount = 0;
    const byType: Record<string, number> = {};
    const recentEntries: Array<{
      id: string;
      type: string;
      amount: number;
      sourceName: string;
      description: string;
      createdAt: string;
    }> = [];

    const typeLabels: Record<string, string> = {
      withdrawal_fee: "Frais de retrait",
      service_fee: "Frais de service",
      exchange_fee: "Commission de change",
      account_maintenance: "Entretien compte",
      transfer_fee: "Frais de transfert",
      tontine_commission: "Commission tontine",
      microcredit_interest: "Intérêts micro-crédit",
      black_card_fee: "Frais carte Black",
      savings_interest_diff: "Intérêts épargne",
      other: "Autres",
    };

    // Period totals
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const amt = Number(data.amount) || 0;
      totalAmount += amt;
      const t = data.type || "other";
      byType[t] = (byType[t] || 0) + amt;

      if (recentEntries.length < 20) {
        const ts = data.createdAt;
        const dateStr = ts
          ? new Date(typeof ts === "string" ? ts : ts.seconds * 1000).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        recentEntries.push({
          id: doc.id,
          type: typeLabels[t] || t,
          amount: amt,
          sourceName: data.sourceName || "Utilisateur",
          description: data.description || "",
          createdAt: dateStr,
        });
      }
    }

    // All-time total
    let allTimeTotal = 0;
    for (const doc of allSnapshot.docs) {
      allTimeTotal += Number(doc.data().amount) || 0;
    }

    // Today total
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    let todayTotal = 0;
    for (const doc of allSnapshot.docs) {
      const ts = doc.data().createdAt;
      if (!ts) continue;
      const d = new Date(typeof ts === "string" ? ts : ts.seconds * 1000);
      if (d >= todayStart) {
        todayTotal += Number(doc.data().amount) || 0;
      }
    }

    // Format breakdown
    const breakdown = Object.entries(byType)
      .map(([type, amount]) => ({
        type,
        label: typeLabels[type] || type,
        amount,
        percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      success: true,
      period,
      total: totalAmount,
      todayTotal,
      allTimeTotal,
      breakdown,
      recent: recentEntries,
      totalTransactions: snapshot.size,
    });
  } catch (err) {
    console.error("[admin:revenue] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
