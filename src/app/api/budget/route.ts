import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Budget API — IDOR-PROTECTED
 *
 * GET  — Fetch current month budget
 * POST — Create / update budget
 * PATCH — Update spent amounts for a category
 *
 * Firestore path: users/{uid}/budget/current
 */

// ── Default categories for a new budget ──
const DEFAULT_CATEGORIES = [
  { id: "alimentation", name: "Alimentation", icon: "cart", allocated: 0, spent: 0, color: "#22c55e" },
  { id: "transport", name: "Transport", icon: "car", allocated: 0, spent: 0, color: "#3b82f6" },
  { id: "communication", name: "Communication", icon: "phone", allocated: 0, spent: 0, color: "#8b5cf6" },
  { id: "loisirs", name: "Loisirs", icon: "spark", allocated: 0, spent: 0, color: "#f59e0b" },
  { id: "sante", name: "Santé", icon: "shield", allocated: 0, spent: 0, color: "#ef4444" },
  { id: "autres", name: "Autres", icon: "grid", allocated: 0, spent: 0, color: "#64748b" },
];

function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── GET: Fetch budget ──
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "budget:get", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const docRef = adminDb.collection("users").doc(auth.uid).collection("budget").doc("current");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({
        success: true,
        budget: null,
        message: "Aucun budget défini pour ce mois",
      });
    }

    const data = docSnap.data()!;
    return NextResponse.json({
      success: true,
      budget: {
        id: docSnap.id,
        month: data.month,
        totalBudget: data.totalBudget ?? 0,
        totalSpent: data.totalSpent ?? 0,
        categories: data.categories ?? DEFAULT_CATEGORIES,
        alertsEnabled: data.alertsEnabled ?? true,
        mtnLimit: data.mtnLimit ?? 300000,
        airtelLimit: data.airtelLimit ?? 200000,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });
  } catch (err) {
    console.error("[budget/get] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// ── POST: Create or update budget ──
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "budget:post", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const totalBudget = Number(body.totalBudget) || 0;
    const categories = Array.isArray(body.categories) ? body.categories : DEFAULT_CATEGORIES;
    const mtnLimit = Number(body.mtnLimit) || 300000;
    const airtelLimit = Number(body.airtelLimit) || 200000;
    const alertsEnabled = body.alertsEnabled !== false;

    if (totalBudget <= 0) {
      return NextResponse.json({ error: "Le budget total doit être supérieur à 0" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const month = getCurrentMonthKey();
    const docRef = adminDb.collection("users").doc(auth.uid).collection("budget").doc("current");

    // Check existing budget for this month
    const existing = await docRef.get();
    const totalSpent = existing.exists ? (existing.data()?.totalSpent ?? 0) : 0;

    await docRef.set({
      month,
      totalBudget,
      totalSpent,
      categories: categories.map((cat: Record<string, unknown>) => ({
        id: cat.id ?? (typeof cat.name === 'string' ? cat.name.toLowerCase() : "autres"),
        name: cat.name ?? "Autres",
        icon: cat.icon ?? "grid",
        allocated: Number(cat.allocated) || 0,
        spent: existing.exists
          ? (existing.data()?.categories?.find(
              (c: Record<string, unknown>) => c.id === (cat.id ?? (typeof cat.name === 'string' ? cat.name.toLowerCase() : null)),
            )?.spent ?? 0)
          : (Number(cat.spent) || 0),
        color: cat.color ?? "#64748b",
      })),
      alertsEnabled,
      mtnLimit,
      airtelLimit,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: "Budget enregistré avec succès",
      budget: {
        id: "current",
        month,
        totalBudget,
        totalSpent,
        categories: DEFAULT_CATEGORIES,
        alertsEnabled,
        mtnLimit,
        airtelLimit,
      },
    });
  } catch (err) {
    console.error("[budget/post] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// ── PATCH: Update spent amounts ──
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "budget:patch", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await req.json();
    const categoryId = String(body.categoryId || "").trim();
    const addAmount = Number(body.amount) || 0;

    if (!categoryId || addAmount <= 0) {
      return NextResponse.json({ error: "Catégorie et montant requis" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const docRef = adminDb.collection("users").doc(auth.uid).collection("budget").doc("current");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Aucun budget défini" }, { status: 404 });
    }

    const data = docSnap.data()!;
    const categories = Array.isArray(data.categories) ? [...data.categories] : [];

    const catIdx = categories.findIndex((c: Record<string, unknown>) => c.id === categoryId);
    if (catIdx === -1) {
      return NextResponse.json({ error: "Catégorie introuvable" }, { status: 404 });
    }

    // Update category spent
    const cat = categories[catIdx] as Record<string, unknown>;
    cat.spent = (Number(cat.spent) || 0) + addAmount;
    categories[catIdx] = cat;

    // Recalculate total spent
    const totalSpent = categories.reduce(
      (sum: number, c: Record<string, unknown>) => sum + (Number(c.spent) || 0),
      0,
    );

    await docRef.update({
      categories,
      totalSpent,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Dépense mise à jour",
      totalSpent,
      categorySpent: cat.spent,
    });
  } catch (err) {
    console.error("[budget/patch] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
