import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { captureError } from "@/lib/sentry";

/* ─────────────────────────────────────────────
   GET /api/goals — List all goals for authenticated user
   ───────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const uid = await verifyAuth(req);
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const db = getFirestore();
    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("goals")
      .orderBy("createdAt", "desc")
      .get();

    const goals = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        targetAmount: data.targetAmount || 0,
        currentAmount: data.currentAmount || 0,
        deadline: data.deadline || "",
        icon: data.icon || "piggy",
        color: data.color || "#3b82f6",
        createdAt: data.createdAt?.toDate?.()?.getTime?.() ?? data.createdAt ?? null,
      };
    });

    return NextResponse.json({ success: true, goals });
  } catch (err) {
    captureError(err, { action: "goals:list", route: "/api/goals", uid });
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST /api/goals — Create a new goal
   ───────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req);
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const body = await req.json();
    const name = sanitize(String(body.name ?? ""));
    const targetAmount = Number(body.targetAmount) || 0;
    const deadline = sanitize(String(body.deadline ?? ""));
    const icon = sanitizeIcon(String(body.icon ?? "piggy"));
    const color = sanitizeColor(String(body.color ?? "#3b82f6"));

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Nom invalide (2+ caractères)" }, { status: 400 });
    }
    if (targetAmount < 1000) {
      return NextResponse.json({ error: "Montant cible minimum : 1 000 FCFA" }, { status: 400 });
    }
    if (targetAmount > 100_000_000) {
      return NextResponse.json({ error: "Montant cible maximum : 100 000 000 FCFA" }, { status: 400 });
    }

    const db = getFirestore();
    const docRef = await db.collection("users").doc(uid).collection("goals").add({
      name,
      targetAmount,
      currentAmount: 0,
      deadline,
      icon,
      color,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: "Objectif créé avec succès",
    });
  } catch (err) {
    captureError(err, { action: "goals:create", route: "/api/goals", uid });
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   PATCH /api/goals — Update a goal (add/withdraw amount)
   ───────────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  const uid = await verifyAuth(req);
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const body = await req.json();
    const goalId = sanitize(String(body.goalId ?? ""));
    const action = sanitize(String(body.action ?? "")); // "add" | "withdraw"
    const amount = Number(body.amount) || 0;

    if (!goalId) {
      return NextResponse.json({ error: "ID objectif requis" }, { status: 400 });
    }
    if (action !== "add" && action !== "withdraw") {
      return NextResponse.json({ error: "Action invalide (add ou withdraw)" }, { status: 400 });
    }
    if (amount < 100) {
      return NextResponse.json({ error: "Montant minimum : 100 FCFA" }, { status: 400 });
    }

    const db = getFirestore();
    const goalRef = db.collection("users").doc(uid).collection("goals").doc(goalId);
    const goalSnap = await goalRef.get();

    if (!goalSnap.exists) {
      return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
    }

    const goalData = goalSnap.data()!;
    const currentAmount = Number(goalData.currentAmount) || 0;
    const targetAmount = Number(goalData.targetAmount) || 0;

    if (action === "add") {
      const newAmount = currentAmount + amount;
      await goalRef.update({
        currentAmount: newAmount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        success: true,
        currentAmount: newAmount,
        message: amount > 0 && newAmount >= targetAmount
          ? "🎉 Félicitations ! Objectif atteint !"
          : `+${formatFCFA(amount)} ajouté à l'objectif`,
      });
    } else {
      // withdraw
      if (amount > currentAmount) {
        return NextResponse.json({ error: "Montant supérieur à l'épargne actuelle" }, { status: 400 });
      }
      const newAmount = currentAmount - amount;
      await goalRef.update({
        currentAmount: newAmount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({
        success: true,
        currentAmount: newAmount,
        message: `-${formatFCFA(amount)} retiré de l'objectif`,
      });
    }
  } catch (err) {
    captureError(err, { action: "goals:update", route: "/api/goals", uid });
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   DELETE /api/goals — Delete a goal
   ───────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const uid = await verifyAuth(req);
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    // Parse body from JSON in request
    const body = await req.json();
    const goalId = sanitize(String(body.goalId ?? ""));

    if (!goalId) {
      return NextResponse.json({ error: "ID objectif requis" }, { status: 400 });
    }

    const db = getFirestore();
    const goalRef = db.collection("users").doc(uid).collection("goals").doc(goalId);
    const goalSnap = await goalRef.get();

    if (!goalSnap.exists) {
      return NextResponse.json({ error: "Objectif introuvable" }, { status: 404 });
    }

    const currentAmount = Number(goalSnap.data()!.currentAmount) || 0;

    // If goal has money, warn about loss
    await goalRef.delete();

    return NextResponse.json({
      success: true,
      message: currentAmount > 0
        ? `Objectif supprimé. ${formatFCFA(currentAmount)} FCFA restitués.`
        : "Objectif supprimé avec succès",
      refundedAmount: currentAmount,
    });
  } catch (err) {
    captureError(err, { action: "goals:delete", route: "/api/goals", uid });
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────── */

async function verifyAuth(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return null;
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

function sanitize(value: string): string {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, "")
    .replace(/['"\\]/g, "")
    .trim()
    .slice(0, 200);
}

const VALID_ICONS = new Set([
  "piggy", "coins", "target", "chart", "trophy", "gift",
  "star", "crown", "spark", "flash", "home", "building",
  "wallet", "bank", "shield", "briefcase", "sun", "moon",
  "send", "receive", "camera", "lock", "phone", "user",
]);

function sanitizeIcon(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z]/g, "").toLowerCase();
  return VALID_ICONS.has(cleaned) ? cleaned : "piggy";
}

function sanitizeColor(value: string): string {
  // Accept hex colors only
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return "#3b82f6";
}

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount);
}
