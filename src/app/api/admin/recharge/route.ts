import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/recharge
 *
 * Admin-only endpoint to credit a user's balance.
 * Uses Firebase Admin SDK (bypasses Firestore security rules).
 *
 * Body: { uid: string, amount: number, description?: string }
 */

const RECHARGE_CAP = 5_000_000; // 5M FCFA max per recharge

export async function POST(req: NextRequest) {
  // ── 1. Admin auth ──
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── 2. Rate limit: 20 recharges/min per admin ──
  const rl = await rateLimit(auth.uid, "admin:recharge", {
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

  if (numericAmount > RECHARGE_CAP) {
    return NextResponse.json(
      { error: `Limite: ${RECHARGE_CAP.toLocaleString("fr-FR")} FCFA max par recharge` },
      { status: 400 }
    );
  }

  const cleanAmount = Math.round(numericAmount);
  const cleanDescription = String(description || "Recharge admin").slice(0, 200);

  // ── 4. Get Admin Firestore ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  // ── 5. Atomic recharge: credit user + create transaction record ──
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      // Read user document
      const userRef = adminDb.collection("moraliUsers").doc(uid);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) {
        throw new Error("USER_NOT_FOUND");
      }

      const userData = userSnap.data()!;
      const currentBalance = Number(userData.balance) || 0;
      const newBalance = currentBalance + cleanAmount;

      // Credit user
      transaction.update(userRef, {
        balance: newBalance,
        updatedAt: new Date(),
      });

      // Create transaction record
      const txnRef = adminDb.collection("transactions").doc();
      transaction.set(txnRef, {
        senderUid: "admin",
        senderName: "Administrateur",
        senderMoraliId: "ADMIN",
        recipientUid: uid,
        recipientMoraliId: userData.moraliId || userData.id || "",
        recipientName: userData.fullName || userData.name || "Utilisateur",
        amount: cleanAmount,
        fees: 0,
        type: "recharge",
        status: "success",
        description: cleanDescription,
        createdAt: new Date(),
      });

      return {
        previousBalance: currentBalance,
        newBalance,
        txnId: txnRef.id,
        recipientName: userData.fullName || userData.name || "Utilisateur",
      };
    });

    return NextResponse.json({
      success: true,
      message: `Recharge de ${cleanAmount.toLocaleString("fr-FR")} FCFA effectuée`,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const errorMap: Record<string, { status: number; error: string }> = {
      USER_NOT_FOUND: {
        status: 404,
        error: "Utilisateur introuvable",
      },
    };

    const mapped = errorMap[msg];
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("[admin:recharge] Error:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur", debug: msg },
      { status: 500 }
    );
  }
}
