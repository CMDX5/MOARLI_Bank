import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Business Dashboard API — IDOR-PROTECTED
 *
 * - GET: Get business stats (revenue, transactions, analytics)
 * - POST: Update business stats (from transaction events)
 *
 * Firestore path: business/{uid}/stats/current
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "business:stats", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    // Read business stats
    const statsDoc = await adminDb
      .collection("business")
      .doc(auth.uid)
      .collection("stats")
      .doc("current")
      .get();

    if (!statsDoc.exists) {
      return NextResponse.json({
        success: true,
        stats: {
          totalRevenue: 0,
          totalTransactions: 0,
          avgTransaction: 0,
          customerCount: 0,
          topProducts: [],
          recentPayments: [],
          dailyRevenue: [],
          weeklyRevenue: 0,
          monthlyRevenue: 0,
        },
        hasData: false,
      });
    }

    const data = statsDoc.data() as Record<string, unknown> | undefined;
    return NextResponse.json({
      success: true,
      stats: {
        totalRevenue: (data?.totalRevenue as number) || 0,
        totalTransactions: (data?.totalTransactions as number) || 0,
        avgTransaction: (data?.avgTransaction as number) || 0,
        customerCount: (data?.customerCount as number) || 0,
        topProducts: (data?.topProducts as Array<{ name: string; count: number; revenue: number }>) || [],
        recentPayments: (data?.recentPayments as Array<{ id: string; description: string; amount: number; currency: string; status: string; timestamp: unknown }>) || [],
        dailyRevenue: (data?.dailyRevenue as Array<{ date: string; revenue: number; transactions: number }>) || [],
        weeklyRevenue: (data?.weeklyRevenue as number) || 0,
        monthlyRevenue: (data?.monthlyRevenue as number) || 0,
      },
      hasData: true,
    });
  } catch (err) {
    console.error("[business] GET error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "business:update", { maxRequests: 15, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const { action, amount, description, currency, customerUid } = body;

    const adminDb = await getAdminFirestore();
    if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

    const statsRef = adminDb
      .collection("business")
      .doc(auth.uid)
      .collection("stats")
      .doc("current");

    const statsDoc = await statsRef.get();
    const raw = statsDoc.exists ? statsDoc.data() : null;
    const current: Record<string, unknown> = raw ? (raw as Record<string, unknown>) : {};

    if (action === "recordTransaction") {
      // Record a new transaction and update stats
      if (!amount || typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
      }

      const amt = Math.round(amount);
      const newTotal = ((current.totalRevenue as number) || 0) + amt;
      const newCount = ((current.totalTransactions as number) || 0) + 1;
      const newAvg = newTotal / newCount;

      // Update daily revenue
      const today = new Date().toISOString().slice(0, 10);
      const dailyRevenue = Array.isArray(current.dailyRevenue) ? [...current.dailyRevenue] : [];
      const todayEntry = dailyRevenue.find((d: { date: string }) => d.date === today);
      if (todayEntry) {
        todayEntry.revenue += amt;
        todayEntry.transactions += 1;
      } else {
        dailyRevenue.push({ date: today, revenue: amt, transactions: 1 });
      }
      // Keep only last 7 days
      const recentDaily = dailyRevenue.slice(-7);

      // Calculate weekly revenue (last 7 days)
      const weeklyRevenue = recentDaily.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);

      // Update top products
      const topProducts = Array.isArray(current.topProducts) ? [...current.topProducts] : [];
      const category = (description || "Autre").slice(0, 40);
      const existingProduct = topProducts.find((p: { name: string }) => p.name === category);
      if (existingProduct) {
        existingProduct.count += 1;
        existingProduct.revenue += amt;
      } else {
        topProducts.push({ name: category, count: 1, revenue: amt });
      }
      // Sort by revenue desc and keep top 10
      topProducts.sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue);
      const trimmedProducts = topProducts.slice(0, 10);

      // Update recent payments
      const recentPayments = Array.isArray(current.recentPayments) ? [...current.recentPayments] : [];
      recentPayments.unshift({
        id: `tx_${Date.now()}`,
        description: description || "Paiement",
        amount: amt,
        currency: currency || "XAF",
        status: "success",
        timestamp: new Date(),
      });
      const trimmedPayments = recentPayments.slice(0, 20);

      // Update customer count (estimate from unique UIDs)
      const customerSet = new Set(Array.isArray(current.customerUids) ? current.customerUids : []);
      if (customerUid && typeof customerUid === "string") {
        customerSet.add(customerUid);
      }

      await statsRef.set({
        ...current,
        totalRevenue: newTotal,
        totalTransactions: newCount,
        avgTransaction: Math.round(newAvg),
        customerCount: customerSet.size || (current.customerCount || 1),
        customerUids: Array.from(customerSet).slice(0, 500),
        topProducts: trimmedProducts,
        recentPayments: trimmedPayments,
        dailyRevenue: recentDaily,
        weeklyRevenue,
        monthlyRevenue: ((current.monthlyRevenue as number) || 0) + amt,
        updatedAt: new Date(),
      }, { merge: true });

      return NextResponse.json({
        success: true,
        totalRevenue: newTotal,
        totalTransactions: newCount,
        message: "Transaction enregistrée",
      });
    }

    if (action === "initStats") {
      // Initialize business stats for a new merchant
      const initialStats = {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransaction: 0,
        customerCount: 0,
        customerUids: [],
        topProducts: [],
        recentPayments: [],
        dailyRevenue: [],
        weeklyRevenue: 0,
        monthlyRevenue: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await statsRef.set(initialStats, { merge: true });

      return NextResponse.json({
        success: true,
        message: "Statistiques initialisées",
      });
    }

    return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
  } catch (err) {
    console.error("[business] POST error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
