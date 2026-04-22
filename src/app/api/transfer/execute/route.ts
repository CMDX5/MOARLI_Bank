import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Atomic Transfer API
 *
 * Handles the full transfer in a single Admin SDK transaction:
 * 1. Verify sender balance & account status
 * 2. Debit sender
 * 3. Credit recipient
 * 4. Create transaction record
 *
 * All steps are atomic — either all succeed or none apply.
 * Uses Admin SDK which bypasses Firestore security rules.
 */

const TRANSFER_CAP = 1_000_000; // 1M FCFA max per transfer

const sanitize = (s: string, maxLen: number) =>
  String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

export async function POST(req: NextRequest) {
  // ── 1. Auth check ──
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── 2. Rate limit: 10 transfers/min per user ──
  const rl = await rateLimit(auth.uid, "transfer:execute", {
    maxRequests: 10,
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
  let body: {
    recipientUid?: string;
    amount?: number;
    senderName?: string;
    senderMoraliId?: string;
    receiptId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  const { recipientUid, amount, senderName, senderMoraliId, receiptId } = body;

  if (!recipientUid || amount === undefined || amount === null) {
    return NextResponse.json(
      { error: "Paramètres manquants" },
      { status: 400 }
    );
  }

  // Validate recipient UID format
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(recipientUid)) {
    return NextResponse.json(
      { error: "Identifiant destinataire invalide" },
      { status: 400 }
    );
  }

  // Validate amount
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }
  if (numericAmount > TRANSFER_CAP) {
    return NextResponse.json(
      { error: `Limite Standard : ${TRANSFER_CAP.toLocaleString("fr-FR")} FCFA max` },
      { status: 400 }
    );
  }

  // Prevent self-transfer
  if (recipientUid === auth.uid) {
    return NextResponse.json(
      { error: "Transfert vers vous-même impossible" },
      { status: 400 }
    );
  }

  const cleanAmount = Math.round(numericAmount);

  // ── 4. Get Admin Firestore ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  // ── 5. Atomic transfer: debit sender + credit recipient + create record ──
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      // ── Read sender document ──
      const senderRef = adminDb.collection("moraliUsers").doc(auth.uid);
      const senderSnap = await transaction.get(senderRef);

      if (!senderSnap.exists) {
        throw new Error("SENDER_NOT_FOUND");
      }

      const senderData = senderSnap.data()!;

      // Check account suspension
      if (senderData.accountStatus === "suspended") {
        throw new Error("ACCOUNT_SUSPENDED");
      }

      const senderBalance = Number(senderData.balance) || 0;
      if (senderBalance < cleanAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // ── Read recipient document ──
      const recipientRef = adminDb
        .collection("moraliUsers")
        .doc(recipientUid);
      const recipientSnap = await transaction.get(recipientRef);

      if (!recipientSnap.exists) {
        throw new Error("RECIPIENT_NOT_FOUND");
      }

      const recipientData = recipientSnap.data()!;
      const recipientBalance = Number(recipientData.balance) || 0;

      // ── Debit sender ──
      const newSenderBalance = senderBalance - cleanAmount;
      transaction.update(senderRef, {
        balance: newSenderBalance,
        updatedAt: new Date(),
      });

      // ── Credit recipient ──
      const newRecipientBalance = recipientBalance + cleanAmount;
      transaction.update(recipientRef, {
        balance: newRecipientBalance,
        updatedAt: new Date(),
      });

      // ── Create transaction record (auto-generated ID) ──
      const txnRef = adminDb.collection("transactions").doc();
      transaction.set(txnRef, {
        senderUid: auth.uid,
        senderMoraliId: sanitize(senderMoraliId || "", 50),
        senderName: sanitize(senderName || "", 100),
        recipientUid,
        recipientMoraliId:
          sanitize(recipientData.moraliId || recipientData.id || "", 50),
        recipientName: sanitize(
          recipientData.fullName ||
            recipientData.name ||
            "Utilisateur",
          100
        ),
        amount: cleanAmount,
        fees: 0,
        type: "virement",
        status: "success",
        receiptId: sanitize(receiptId || "", 50),
        createdAt: new Date(),
      });

      return {
        newSenderBalance,
        newRecipientBalance,
        txnId: txnRef.id,
        recipientName:
          recipientData.fullName || recipientData.name || "Utilisateur",
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Map transaction errors to HTTP responses
    const errorMap: Record<string, { status: number; error: string }> = {
      SENDER_NOT_FOUND: {
        status: 404,
        error: "Compte expéditeur introuvable",
      },
      ACCOUNT_SUSPENDED: {
        status: 403,
        error: "Votre compte est suspendu. Opération impossible.",
      },
      INSUFFICIENT_BALANCE: {
        status: 400,
        error: "Solde insuffisant pour effectuer ce virement",
      },
      RECIPIENT_NOT_FOUND: {
        status: 404,
        error: "Compte destinataire introuvable",
      },
    };

    const mapped = errorMap[msg];
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("[transfer:execute] Transaction failed:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
