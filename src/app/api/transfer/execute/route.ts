import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { auditLog, AUDIT_ACTIONS, getClientIp } from "@/lib/audit-log";

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
    pin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  const { recipientUid, amount, receiptId, pin } = body;

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
  if (cleanAmount <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  if (!pin || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Code PIN requis" }, { status: 403 });
  }

  // ── 4. Get Admin Firestore ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  // ── 5. PIN is required. The client check is not trusted. ──
  const pinRl = await rateLimit(auth.uid, "transfer:pin", { maxRequests: 5, windowSec: 60 });
  if (!pinRl.allowed) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans 1 minute." }, { status: 429 });
  }
  const pinSnap = await adminDb.doc("pinRecords/" + auth.uid).get();
  if (!pinSnap.exists || !pinSnap.data()?.pinBcrypt) {
    return NextResponse.json({ error: "Code PIN requis" }, { status: 403 });
  }
  const bcrypt = await import("bcryptjs");
  const pinOk = await bcrypt.compare(pin, String(pinSnap.data()?.pinBcrypt));
  if (!pinOk) {
    return NextResponse.json({ error: "Code PIN incorrect" }, { status: 403 });
  }

  // ── 6. Atomic transfer: all reads, then all writes ──
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const senderRef = adminDb.collection("moraliUsers").doc(auth.uid!);
      const recipientRef = adminDb.collection("moraliUsers").doc(recipientUid);
      const senderSnap = await transaction.get(senderRef);
      const recipientSnap = await transaction.get(recipientRef);

      if (!senderSnap.exists) throw new Error("SENDER_NOT_FOUND");
      const senderData = senderSnap.data() || {};
      if (senderData.accountStatus === "suspended") throw new Error("ACCOUNT_SUSPENDED");
      const senderBalance = Number(senderData.balance) || 0;
      if (senderBalance < cleanAmount) throw new Error("INSUFFICIENT_BALANCE");

      const recipientData = recipientSnap.exists ? (recipientSnap.data() || {}) : {};
      const recipientBalance = recipientSnap.exists ? Number(recipientData.balance) || 0 : 0;

      const newSenderBalance = senderBalance - cleanAmount;
      const newRecipientBalance = recipientBalance + cleanAmount;
      const senderName = sanitize(String(senderData.fullName || senderData.name || "Utilisateur"), 100);
      const recipientName = sanitize(String(recipientData.fullName || recipientData.name || "Utilisateur"), 100);

      transaction.update(senderRef, { balance: newSenderBalance, updatedAt: new Date() });

      if (recipientSnap.exists) {
        transaction.update(recipientRef, { balance: newRecipientBalance, updatedAt: new Date() });
      } else {
        transaction.set(recipientRef, {
          uid: recipientUid,
          email: "",
          fullName: "Utilisateur",
          balance: newRecipientBalance,
          savingsBalance: 0,
          totalSent: 0,
          totalReceived: cleanAmount,
          accountStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const txnRef = adminDb.collection("transactions").doc();
      transaction.set(txnRef, {
        senderUid: auth.uid,
        senderMoraliId: sanitize(String(senderData.moraliId || ""), 50),
        senderName,
        recipientUid,
        recipientMoraliId: sanitize(String(recipientData.moraliId || recipientData.id || ""), 50),
        recipientName,
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
        senderName,
        recipientName,
      };
    });

    // ── 6. Send notifications to both parties (best-effort, non-blocking) ──
    try {
      const formattedAmount = cleanAmount.toLocaleString("fr-FR");
      const now = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Brazzaville" });
      const senderNameStr = result.senderName || "Utilisateur";

      // Recipient notification: "Vous avez reçu un virement"
      await adminDb.collection("users").doc(recipientUid).collection("notifications").add({
        title: `Virement reçu — ${formattedAmount} FCFA`,
        time: now,
        badge: "Reçu",
        badgeClass: "nb-green",
        icon: "receive",
        bg: "rgba(34,197,94,0.12)",
        read: false,
        createdAt: new Date(),
        senderUid: auth.uid,
        senderName: senderNameStr,
      });

      // Sender notification: "Votre virement a été envoyé"
      await adminDb.collection("users").doc(auth.uid).collection("notifications").add({
        title: `Virement envoyé — ${formattedAmount} FCFA à ${result.recipientName}`,
        time: now,
        badge: "Envoyé",
        badgeClass: "nb-blue",
        icon: "send",
        bg: "rgba(59,130,246,0.12)",
        read: false,
        createdAt: new Date(),
        recipientUid,
      });
    } catch (notifErr) {
      // Notifications are best-effort — never block the transfer
      console.error("[transfer:execute] Notification delivery failed:", notifErr);
    }

    auditLog({
      uid: auth.uid!,
      action: AUDIT_ACTIONS.TRANSFER_SEND,
      details: { amount: cleanAmount, recipientUid, txnId: result.txnId },
      ip: getClientIp(req),
    }).catch(() => {});

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

    auditLog({
      uid: auth.uid!,
      action: AUDIT_ACTIONS.TRANSFER_FAILED,
      details: { amount: cleanAmount, recipientUid, error: msg },
      ip: getClientIp(req),
      level: "warning",
    }).catch(() => {});

    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
