import { NextRequest, NextResponse } from "next/server";
// firebase-admin v13: doc/collection/query methods are on the Firestore instance (adminDb)
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { validateBody, schemas } from "@/lib/validation";
import { captureError, captureSecurityEvent } from "@/lib/sentry";

export async function POST(req: NextRequest) {
  // Auth
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "tx:create", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Get Admin Firestore early (needed for ownership check + transaction write)
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    const rawBody = await req.json();
    const validation = validateBody(schemas.transactionCreate, rawBody);
    if (!validation.success) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }
    const { receiptId, senderUid, senderMoraliId, senderName, recipientUid, recipientMoraliId, recipientName, amount, fees, type, destination } = validation.data;

    // Guard: uid must be present after auth
    const callerUid = auth.uid;
    if (!callerUid) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Determine if this is a self-transaction (depot/retrait where senderUid === recipientUid)
    const isSelfTransaction = senderUid === recipientUid;
    const isDepositOrWithdrawal = type === "depot" || type === "retrait";

    // Prevent self-transfer EXCEPT for depot/retrait (deposits and withdrawals are self-transactions by design)
    if (isSelfTransaction && !isDepositOrWithdrawal) {
      return NextResponse.json({ error: "Impossible d'envoyer à soi-même" }, { status: 400 });
    }

    // Ownership check: authenticated user must be the sender (or admin)
    if (callerUid !== senderUid) {
      const callerDoc = await adminDb.collection("moraliUsers").doc(callerUid).get();
      const callerRole = callerDoc.data()?.role;
      if (callerRole !== "admin") {
        captureSecurityEvent("transaction_idor_attempt", { uid: callerUid, details: { senderUid, recipientUid } });
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
      }
    }

    // SECURITY FIX: Use Firestore runTransaction for atomic duplicate detection + write
    // Prevents race condition where two simultaneous requests both pass the duplicate check
    const lockDocId = `receiptLock_${String(receiptId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const lockRef = adminDb.collection("txLocks").doc(lockDocId);

    // Determine target collection: use "transactions" for depot/retrait (client reads from here)
    // and "serverTransactions" for cross-user transfers (virement)
    const txCollection = isDepositOrWithdrawal ? "transactions" : "serverTransactions";

    try {
      const result = await adminDb.runTransaction(async (transaction) => {
        // Atomic check-and-set: verify lock doesn't exist
        const lockSnap = await transaction.get(lockRef);

        if (lockSnap.exists) {
          // Already processed — return existing transaction ID (idempotent)
          const existingTxId = lockSnap.data()?.transactionId;
          if (existingTxId) {
            // Verify the existing transaction exists in the target collection
            const existingTxRef = adminDb.collection(txCollection).doc(existingTxId);
            const existingTxSnap = await transaction.get(existingTxRef);
            if (existingTxSnap.exists) {
              return { success: true, id: existingTxId, duplicate: true };
            }
            // Also check the other collection in case of migration
            const otherCollection = txCollection === "transactions" ? "serverTransactions" : "transactions";
            const otherTxRef = adminDb.collection(otherCollection).doc(existingTxId);
            const otherTxSnap = await transaction.get(otherTxRef);
            if (otherTxSnap.exists) {
              return { success: true, id: existingTxId, duplicate: true };
            }
          }
          // Lock exists but transaction doesn't — treat as new (stale lock)
        }

        // Create the transaction document
        const docRef = adminDb.collection(txCollection).doc();
        const txData = {
          receiptId: String(receiptId),
          senderUid: String(senderUid),
          senderMoraliId: String(senderMoraliId || ""),
          senderName: String(senderName || "Utilisateur"),
          recipientUid: String(recipientUid),
          recipientMoraliId: String(recipientMoraliId || ""),
          recipientName: String(recipientName || "Utilisateur"),
          amount: Number(amount),
          fees: Number(fees) || 0,
          type: String(type || "virement"),
          status: "success",
          destination: destination ? String(destination) : null,
          createdAt: new Date(),
        };

        transaction.set(docRef, txData);

        // ── BUG FIX: Update the user's balance atomically for deposits/withdrawals ──
        // Previously this route only recorded the transaction document WITHOUT
        // crediting/debiting the balance, so deposits appeared in the history
        // but the available balance stayed at 0 — making withdrawals impossible
        // and breaking the entire financial chain.
        if (isDepositOrWithdrawal) {
          const userRef = adminDb.collection("moraliUsers").doc(callerUid);
          const userSnap = await transaction.get(userRef);

          let currentBalance = 0;
          if (userSnap.exists) {
            currentBalance = Number(userSnap.data()?.balance) || 0;
          }

          const numericAmount = Number(amount);
          const numericFees = Number(fees) || 0;

          if (type === "depot") {
            // Deposit: credit the full amount (fees are paid by the bank in demo mode)
            const newBalance = currentBalance + numericAmount;
            transaction.set(userRef, {
              balance: newBalance,
              updatedAt: new Date(),
            }, { merge: true });
          } else if (type === "retrait") {
            // Withdrawal: debit amount + fees, refuse if insufficient balance
            const totalDebit = numericAmount + numericFees;
            if (currentBalance < totalDebit) {
              throw new Error("INSUFFICIENT_BALANCE");
            }
            const newBalance = currentBalance - totalDebit;
            transaction.set(userRef, {
              balance: newBalance,
              updatedAt: new Date(),
            }, { merge: true });
          }
        }

        // Create the lock (prevents race condition)
        transaction.set(lockRef, {
          transactionId: docRef.id,
          receiptId: String(receiptId),
          createdAt: new Date(),
          // Auto-expire after 24 hours (cleanup)
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        return { success: true, id: docRef.id, fees: Number(fees) || 0 };
      });

      // ── Track bank revenue server-side for fee-generating transactions ──
      const txFees = (result as any).fees || 0;
      if (txFees > 0 && (type === "retrait" || type === "depot")) {
        try {
          const feeType = type === "retrait" ? "withdrawal_fee" : "service_fee";
          let sourceName = "Utilisateur";
          try {
            const userDoc = await adminDb.collection("moraliUsers").doc(callerUid).get();
            if (userDoc.exists) {
              sourceName = userDoc.data()?.fullName || userDoc.data()?.name || "Utilisateur";
            }
          } catch { /* ignore */ }
          await adminDb.collection("bankRevenue").add({
            type: feeType,
            amount: Math.round(txFees),
            sourceUid: callerUid,
            sourceName,
            referenceId: String(receiptId),
            description: `${feeType === "withdrawal_fee" ? "Frais de retrait (2%)" : "Frais de service (2%)"} — ${Number(amount).toLocaleString("fr-FR")} FCFA`,
            currency: "FCFA",
            createdAt: new Date(),
          });
        } catch (revErr) {
          // Revenue tracking best-effort — never block the transaction
          console.error("[tx:create] Revenue tracking failed:", revErr);
        }
      }

      return NextResponse.json(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Map balance-related transaction errors to user-friendly responses
      if (errMsg === "INSUFFICIENT_BALANCE") {
        return NextResponse.json(
          { success: false, error: "Solde insuffisant pour cette opération" },
          { status: 400 }
        );
      }
      captureError(err, { action: "transaction:create", route: "/api/transactions/create", uid: callerUid, extra: { receiptId, senderUid, recipientUid, amount } });
      return NextResponse.json({ success: false, error: "Transaction failed" }, { status: 500 });
    }
  } catch (err) {
    captureError(err, { action: "transaction:create:validation", route: "/api/transactions/create", uid: auth.uid ?? "unknown" });
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }
}
