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
    const { receiptId, senderUid, senderMoraliId, senderName, recipientUid, recipientMoraliId, recipientName, amount, type, destination } = validation.data;

    // Prevent self-transfer
    if (senderUid === recipientUid) {
      return NextResponse.json({ error: "Impossible d'envoyer à soi-même" }, { status: 400 });
    }

    // Ownership check: authenticated user must be the sender (or admin)
    if (auth.uid !== senderUid) {
      const callerDoc = await adminDb.collection("moraliUsers").doc(auth.uid).get();
      const callerRole = callerDoc.data()?.role;
      if (callerRole !== "admin") {
        captureSecurityEvent("transaction_idor_attempt", { uid: auth.uid, details: { senderUid, recipientUid } });
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
      }
    }

    // Validate amount is a positive finite number
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ success: false, error: "Montant invalide" }, { status: 400 });
    }

    // Server-side fee calculation
    // TODO: Calculate fees server-side based on transaction type and amount
    const calculatedFees = 0; // Will be replaced by real fee calculation when payment APIs are integrated

    try {
      // ── ATOMIC TRANSACTION: duplicate check + balance debit + credit + record ──
      // Prevents race conditions: two simultaneous transfers cannot both succeed
      const result = await adminDb.runTransaction(async (transaction) => {
        // 1. Duplicate detection by receiptId
        const existingQuery = adminDb.collection("serverTransactions")
          .where("receiptId", "==", String(receiptId))
          .limit(1);
        const existingSnap = await transaction.get(existingQuery);

        if (!existingSnap.empty) {
          return { duplicate: true, existingId: existingSnap.docs[0].id };
        }

        // 2. Read sender balance for atomic check
        const senderRef = adminDb.collection("moraliUsers").doc(String(senderUid));
        const senderDoc = await transaction.get(senderRef);

        if (!senderDoc.exists) {
          return { error: "Émetteur introuvable", code: 404 };
        }

        const senderData = senderDoc.data();
        const currentBalance = Number(senderData?.balance) || 0;
        const totalDebit = numericAmount + calculatedFees;

        // 3. Insufficient balance check (atomic — no race condition possible)
        if (currentBalance < totalDebit) {
          return { error: "Solde insuffisant", code: 422, currentBalance };
        }

        // 4. Read recipient for atomic credit
        const recipientRef = adminDb.collection("moraliUsers").doc(String(recipientUid));
        const recipientDoc = await transaction.get(recipientRef);

        if (!recipientDoc.exists) {
          return { error: "Destinataire introuvable", code: 404 };
        }

        const recipientBalance = Number(recipientDoc.data()?.balance) || 0;

        // 5. Debit sender
        transaction.update(senderRef, {
          balance: currentBalance - totalDebit,
          updatedAt: new Date(),
        });

        // 6. Credit recipient
        transaction.update(recipientRef, {
          balance: recipientBalance + numericAmount,
          updatedAt: new Date(),
        });

        // 7. Create transaction record
        const txDocRef = adminDb.collection("serverTransactions").doc();
        transaction.set(txDocRef, {
          receiptId: String(receiptId),
          senderUid: String(senderUid),
          senderMoraliId: String(senderMoraliId || ""),
          senderName: String(senderName || "Utilisateur"),
          recipientUid: String(recipientUid),
          recipientMoraliId: String(recipientMoraliId || ""),
          recipientName: String(recipientName || "Utilisateur"),
          amount: numericAmount,
          fees: calculatedFees,
          type: String(type || "virement"),
          status: "success",
          destination: destination ? String(destination) : null,
          createdAt: new Date(),
        });

        return { success: true, id: txDocRef.id, newSenderBalance: currentBalance - totalDebit };
      });

      // Handle transaction results
      if (result.duplicate) {
        return NextResponse.json({ success: true, id: result.existingId, duplicate: true });
      }

      if (result.error) {
        const statusCode = result.code || 400;
        return NextResponse.json(
          { success: false, error: result.error, ...(result.currentBalance !== undefined && { currentBalance: result.currentBalance }) },
          { status: statusCode }
        );
      }

      return NextResponse.json({ success: true, id: result.id });
    } catch (err: unknown) {
      captureError(err, { action: "transaction:create", route: "/api/transactions/create", uid: auth.uid, extra: { receiptId, senderUid, recipientUid, amount } });
      return NextResponse.json({ success: false, error: "Transaction failed" }, { status: 500 });
    }
  } catch (err) {
    captureError(err, { action: "transaction:create:validation", route: "/api/transactions/create", uid: auth.uid });
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }
}
