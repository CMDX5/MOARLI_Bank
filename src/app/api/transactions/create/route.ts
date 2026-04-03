import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, query, where, getDocs, limit as queryLimit } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

export async function POST(req: NextRequest) {
  // Rate limit
  const clientId = getClientId(req);
  const rl = rateLimit(`tx:create:${clientId}`, { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  // Auth
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;

  // Get Admin Firestore early (needed for ownership check + transaction write)
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const {
      uid, receiptId, senderUid, senderMoraliId, senderName,
      recipientUid, recipientMoraliId, recipientName,
      amount, fees, type, status, destination,
    } = body;

    if (!receiptId || !senderUid || !recipientUid || !amount) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    // Type validation for required fields
    if (typeof senderUid !== "string" || typeof recipientUid !== "string") {
      return NextResponse.json({ error: "Champs invalides" }, { status: 400 });
    }

    // Validate amount is a positive number
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json({ success: false, error: "Montant invalide" }, { status: 400 });
    }

    // Ownership check: authenticated user must be the sender (or admin)
    if (auth.uid !== senderUid) {
      const callerDoc = await adminDb.collection("moraliUsers").doc(auth.uid).get();
      const callerRole = callerDoc.data()?.role;
      if (callerRole !== "admin") {
        return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
      }
    }

    // Server-side fee calculation
    // TODO: Calculate fees server-side based on transaction type and amount
    const calculatedFees = 0; // Will be replaced by real fee calculation when payment APIs are integrated

    try {
      // Duplicate detection: check if receiptId already exists
      const existingQuery = query(
        collection(adminDb, "serverTransactions"),
        where("receiptId", "==", String(receiptId)),
        queryLimit(1)
      );
      const existingSnap = await getDocs(existingQuery);

      if (!existingSnap.empty) {
        const existingDoc = existingSnap.docs[0];
        return NextResponse.json({ success: true, id: existingDoc.id, duplicate: true });
      }

      const docRef = await addDoc(collection(adminDb, "serverTransactions"), {
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

      return NextResponse.json({ success: true, id: docRef.id });
    } catch (err: unknown) {
      console.error("[transactions/create] Error:", err);
      return NextResponse.json({ success: false, error: "Transaction failed" }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }
}
