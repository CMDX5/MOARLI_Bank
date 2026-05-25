import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/withdraw
 *
 * Admin-only endpoint to debit a user's balance (withdrawal).
 * Uses Firebase Admin SDK (bypasses Firestore security rules).
 *
 * Body: { uid: string, amount: number, description?: string }
 */

const WITHDRAW_CAP = 5_000_000; // 5M FCFA max per withdrawal

export async function POST(req: NextRequest) {
  // ── 1. Admin auth ──
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── 2. Rate limit: 20 withdrawals/min per admin ──
  const rl = await rateLimit(auth.uid, "admin:withdraw", {
    maxRequests: 20,
    windowSec: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // ── 3. Parse & validate body ──
  let body: { uid?: string; amount?: number; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  const { uid, amount, description } = body;

  if (!uid || amount === undefined || amount === null) {
    return NextResponse.json(
      { error: "Paramètres manquants: uid et amount requis" },
      { status: 400 }
    );
  }

  // Validate UID format
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
    return NextResponse.json(
      { error: "Format UID invalide" },
      { status: 400 }
    );
  }

  // Validate amount
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return NextResponse.json(
      { error: "Montant invalide (doit être un nombre positif)" },
      { status: 400 }
    );
  }

  if (numericAmount > WITHDRAW_CAP) {
    return NextResponse.json(
      { error: `Limite: ${WITHDRAW_CAP.toLocaleString("fr-FR")} FCFA max par retrait` },
      { status: 400 }
    );
  }

  const cleanAmount = Math.round(numericAmount);
  const cleanDescription = String(description || "Retrait admin").slice(0, 200);

  // ── 4. Get Admin Firestore ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  // ── 5. Atomic withdrawal: debit user + create transaction record ──
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      // Read user document
      const userRef = adminDb.collection("moraliUsers").doc(uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists) {
        throw new Error("USER_NOT_FOUND");
      }

      const userData = userSnap.data()!;
      const currentBalance = Number(userData.balance) || 0;

      if (currentBalance < cleanAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const newBalance = currentBalance - cleanAmount;

      // Debit user
      transaction.update(userRef, {
        balance: newBalance,
        updatedAt: new Date(),
      });

      // Create transaction record
      const txnRef = adminDb.collection("transactions").doc();
      transaction.set(txnRef, {
        senderUid: uid,
        senderName: userData.fullName || userData.name || "Utilisateur",
        senderMoraliId: userData.moraliId || userData.id || "",
        recipientUid: "admin",
        recipientName: "Administrateur",
        recipientMoraliId: "ADMIN",
        amount: cleanAmount,
        fees: 0,
        type: "withdraw",
        status: "success",
        description: cleanDescription,
        createdAt: new Date(),
      });

      return {
        previousBalance: currentBalance,
        newBalance,
        txnId: txnRef.id,
        userName: userData.fullName || userData.name || "Utilisateur",
      };
    });

    return NextResponse.json({
      success: true,
      message: `Retrait de ${cleanAmount.toLocaleString("fr-FR")} FCFA effectué`,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const errorMap: Record<string, { status: number; error: string }> = {
      USER_NOT_FOUND: {
        status: 404,
        error: "Utilisateur introuvable",
      },
      INSUFFICIENT_BALANCE: {
        status: 400,
        error: "Solde insuffisant pour effectuer ce retrait",
      },
    };

    const mapped = errorMap[msg];
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("[admin:withdraw] Error:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
