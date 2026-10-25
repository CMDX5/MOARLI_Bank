import type { Firestore } from "firebase-admin/firestore";
import { decideSettlement, type CinetPayCheck, type SettlementDecision } from "@/lib/cinetpay";

export type PendingDepositInput = {
  transactionId: string;
  uid: string;
  amount: number;
  currency: string;
  phone: string;
  operator: "mtn" | "airtel";
  moraliId: string;
  fullName: string;
};

export type SettleResult = {
  outcome: SettlementDecision | "unknown" | "user_missing";
  balance?: number;
  amount?: number;
  currency?: string;
};

const sanitize = (value: string, maxLen: number) =>
  String(value || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

export async function createPendingDeposit(adminDb: Firestore, input: PendingDepositInput): Promise<void> {
  const now = new Date();
  await adminDb.collection("cinetpayPayments").doc(input.transactionId).set({
    transactionId: input.transactionId,
    uid: input.uid,
    amount: input.amount,
    currency: input.currency,
    phone: input.phone,
    operator: input.operator,
    moraliId: sanitize(input.moraliId, 50),
    fullName: sanitize(input.fullName, 100),
    status: "pending",
    credited: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function attachCheckout(
  adminDb: Firestore,
  transactionId: string,
  paymentToken: string,
): Promise<void> {
  await adminDb.collection("cinetpayPayments").doc(transactionId).set({
    paymentToken: paymentToken.slice(0, 200),
    checkoutStarted: true,
    updatedAt: new Date(),
  }, { merge: true });
}

export async function markCheckoutFailed(
  adminDb: Firestore,
  transactionId: string,
  code: string,
): Promise<void> {
  await adminDb.collection("cinetpayPayments").doc(transactionId).set({
    checkoutError: code.slice(0, 40),
    updatedAt: new Date(),
  }, { merge: true });
}

/**
 * Idempotent credit. The payment document is the lock: `credited` flips in the
 * same transaction as the balance increment, so a replayed notify cannot pay twice.
 */
export async function settleVerifiedPayment(
  adminDb: Firestore,
  transactionId: string,
  check: CinetPayCheck,
): Promise<SettleResult> {
  const payRef = adminDb.collection("cinetpayPayments").doc(transactionId);
  const outcome = await adminDb.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists) return { outcome: "unknown" as const };
    const pay = paySnap.data() || {};
    const storedAmount = Number(pay.amount);
    const storedCurrency = String(pay.currency || "");
    const uid = String(pay.uid || "");
    const decision = decideSettlement({
      alreadyCredited: pay.credited === true,
      storedAmount,
      storedCurrency,
      check,
    });

    if (decision === "duplicate") {
      return { outcome: decision, amount: storedAmount, currency: storedCurrency };
    }

    if (decision !== "credit") {
      const nextStatus = decision === "refused" ? "refused" : "pending";
      tx.set(payRef, {
        status: nextStatus,
        cinetpayCode: check.code.slice(0, 16),
        cinetpayStatus: check.status.slice(0, 40),
        updatedAt: new Date(),
      }, { merge: true });
      return { outcome: decision, amount: storedAmount, currency: storedCurrency };
    }

    const userRef = adminDb.collection("moraliUsers").doc(uid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { outcome: "user_missing" as const, amount: storedAmount, currency: storedCurrency };

    const user = userSnap.data() || {};
    const balance = Number(user.balance) || 0;
    const newBalance = balance + storedAmount;
    const name = sanitize(String(user.fullName || user.name || pay.fullName || "Utilisateur"), 100);
    const moraliId = sanitize(String(user.moraliId || pay.moraliId || ""), 50);
    const txRef = adminDb.collection("transactions").doc(transactionId);
    const now = new Date();

    tx.update(userRef, { balance: newBalance, updatedAt: now });
    tx.set(txRef, {
      receiptId: transactionId,
      senderUid: uid,
      senderMoraliId: moraliId,
      senderName: name,
      recipientUid: uid,
      recipientMoraliId: moraliId,
      recipientName: name,
      amount: storedAmount,
      fees: 0,
      type: "depot",
      destination: "cash",
      status: "success",
      channel: "cinetpay",
      operator: pay.operator === "airtel" ? "airtel" : "mtn",
      createdAt: now,
    });
    tx.set(payRef, {
      status: "accepted",
      credited: true,
      creditedAt: now,
      balanceAfter: newBalance,
      cinetpayCode: check.code.slice(0, 16),
      cinetpayStatus: "ACCEPTED",
      updatedAt: now,
    }, { merge: true });

    return {
      outcome: "credit" as const,
      balance: newBalance,
      amount: storedAmount,
      currency: storedCurrency,
      uid,
      name,
    };
  });

  if (outcome.outcome === "credit" && "uid" in outcome && outcome.uid) {
    try {
      await adminDb.collection(`users/${outcome.uid}/notifications`).add({
        title: `Dépôt Mobile Money confirmé — ${Number(outcome.amount).toLocaleString("fr-FR")} FCFA`,
        time: "À l'instant",
        badge: "Reçu",
        badgeClass: "nb-green",
        icon: "wallet",
        bg: "rgba(34,197,94,0.12)",
        read: false,
        createdAt: new Date(),
        sentBy: "cinetpay",
      });
    } catch {
      /* notification is best-effort; the credit already committed */
    }
  }

  return {
    outcome: outcome.outcome,
    balance: "balance" in outcome ? outcome.balance : undefined,
    amount: "amount" in outcome ? outcome.amount : undefined,
    currency: "currency" in outcome ? outcome.currency : undefined,
  };
}
