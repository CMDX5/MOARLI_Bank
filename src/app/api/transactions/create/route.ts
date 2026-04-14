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

    // Server-side fee calculation
    // TODO: Calculate fees server-side based on transaction type and amount
    const calculatedFees = 0;

    // SECURITY FIX: Use Firestore runTransaction for atomic duplicate detection + write
    // Prevents race condition where two simultaneous requests both pass the duplicate check
    const lockDocId = `receiptLock_${String(receiptId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const lockRef = adminDb.collection("txLocks").doc(lockDocId);

    try {
      const result = await adminDb.runTransaction(async (transaction) => {
        // Atomic check-and-set: verify lock doesn't exist
        const lockSnap = await transaction.get(lockRef);

        if (lockSnap.exists) {
          // Already processed — return existing transaction ID (idempotent)
          const existingTxId = lockSnap.data()?.transactionId;
          if (existingTxId) {
            // Verify the existing transaction exists
            const existingTxRef = adminDb.collection("serverTransactions").doc(existingTxId);
            const existingTxSnap = await transaction.get(existingTxRef);
            if (existingTxSnap.exists) {
              return { success: true, id: existingTxId, duplicate: true };
            }
          }
          // Lock exists but transaction doesn't — treat as new (stale lock)
        }

        // Create the transaction document
        const docRef = adminDb.collection("serverTransactions").doc();
        const txData = {
          receiptId: String(receiptId),
          senderUid: String(senderUid),
          senderMoraliId: String(senderMoraliId || ""),
          senderName: String(senderName || "Utilisateur"),
          recipientUid: String(recipientUid),
          recipientMoraliId: String(recipientMoraliId || ""),
          recipientName: String(recipientName || "Utilisateur"),
          amount: Number(amount),
          fees: 0,
          type: String(type || "virement"),
          status: "success",
          destination: destination ? String(destination) : null,
          createdAt: new Date(),
        };

        transaction.set(docRef, txData);

        // Create the lock (prevents race condition)
        transaction.set(lockRef, {
          transactionId: docRef.id,
          receiptId: String(receiptId),
          createdAt: new Date(),
          // Auto-expire after 24 hours (cleanup)
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        return { success: true, id: docRef.id };
      });

      return NextResponse.json(result);
    } catch (err: unknown) {
      captureError(err, { action: "transaction:create", route: "/api/transactions/create", uid: auth.uid, extra: { receiptId, senderUid, recipientUid, amount } });
      return NextResponse.json({ success: false, error: "Transaction failed" }, { status: 500 });
    }
  } catch (err) {
    captureError(err, { action: "transaction:create:validation", route: "/api/transactions/create", uid: auth.uid });
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }
}
