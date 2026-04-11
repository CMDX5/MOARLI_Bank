import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, doc, getDoc, getDocs, deleteDoc, query, where, orderBy, limit as queryLimit } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Pending Credit API Routes
 * 
 * Security:
 * - Rate limited per endpoint
 * - Input validation & sanitization
 * - Amount bounds checking
 * - Uses Firebase Admin Firestore
 */

// GET: Fetch pending credits for a recipient
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // ── Rate limit (uid-based, after auth): 60 reads/min ──
  const rl = await rateLimit(auth.uid, "pending-credit:GET", { maxRequests: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Paramètre uid requis" }, { status: 400 });
    }

    // Ownership check: can only fetch own pending credits
    if (uid !== auth.uid) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Sanitize uid — must be Firebase UID format
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const q = query(
      collection(adminDb, "pendingCredits"),
      where("recipientUid", "==", uid),
      orderBy("createdAt", "asc"),
      queryLimit(100)
    );
    const snapshot = await getDocs(q);

    const credits = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ credits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pending-credit:GET]", msg);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

// POST: Create a new pending credit
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // ── Rate limit (uid-based, after auth): 20 writes/min ──
  const rl = await rateLimit(auth.uid, "pending-credit:POST", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    let body: { recipientUid?: string; amount?: number; senderName?: string; senderMoraliId?: string; receiptId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { recipientUid, amount, senderName, senderMoraliId, receiptId } = body;

    // ── Validation ──
    if (!recipientUid || amount === undefined || amount === null) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    // Validate uid format
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(recipientUid)) {
      return NextResponse.json({ error: "Identifiant destinataire invalide" }, { status: 400 });
    }

    // Validate amount bounds
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    if (numericAmount > 50_000_000) {
      return NextResponse.json({ error: "Montant exceeds la limite (50M FCFA)" }, { status: 400 });
    }

    // Sanitize string inputs (prevent XSS/NoSQL injection)
    const sanitize = (s: string, maxLen: number) =>
      String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const docRef = await addDoc(collection(adminDb, "pendingCredits"), {
      recipientUid,
      senderUid: auth.uid,
      amount: Math.round(numericAmount),
      senderName: sanitize(senderName || "", 100),
      senderMoraliId: sanitize(senderMoraliId || "", 50),
      receiptId: sanitize(receiptId || "", 50),
      status: "pending",
      createdAt: new Date(),
    });

    const credit = {
      id: docRef.id,
      recipientUid,
      senderUid: auth.uid,
      amount: Math.round(numericAmount),
      senderName: sanitize(senderName || "", 100),
      senderMoraliId: sanitize(senderMoraliId || "", 50),
      receiptId: sanitize(receiptId || "", 50),
      status: "pending",
      createdAt: new Date(),
    };

    return NextResponse.json({ success: true, credit });
  } catch (err) {
    console.error("[pending-credit:POST] Operation failed");
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

// DELETE: Delete a pending credit by id
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // ── Rate limit (uid-based, after auth): 30 deletes/min ──
  const rl = await rateLimit(auth.uid, "pending-credit:DELETE", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Paramètre id requis" }, { status: 400 });
    }

    // Validate id format (Firestore document ID)
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    // Ownership check: can only delete own pending credits
    const docRef = doc(adminDb, "pendingCredits", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists() || docSnap.data()?.recipientUid !== auth.uid) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    await deleteDoc(docRef);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pending-credit:DELETE] Operation failed");
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

// PUT: Apply a pending credit to recipient balance (SECURE — requires existing pending credit)
//
// SECURITY DESIGN (pentest fix):
// - Requires a valid pendingCreditId (must exist in Firestore)
// - Verifies creditData.recipientUid === authenticated user (only recipient can apply)
// - Verifies creditData.status !== "applied" (prevents double-application)
// - Amount comes from the Firestore document, NOT from the request body
// - Uses Firestore runTransaction() for atomic balance credit + status update
export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "pending-credit:PUT", { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const body = await req.json();
    const { pendingCreditId } = body as { pendingCreditId?: string };

    // ── 1. Require a valid pendingCreditId ──
    if (!pendingCreditId || typeof pendingCreditId !== "string") {
      return NextResponse.json({ error: "pendingCreditId requis" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(pendingCreditId)) {
      return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const creditRef = adminDb.collection("pendingCredits").doc(pendingCreditId);

    // ── 2. Atomic transaction: read credit → verify → credit balance → mark applied ──
    const result = await adminDb.runTransaction(async (transaction) => {
      const creditSnap = await transaction.get(creditRef);

      // Credit must exist
      if (!creditSnap.exists()) {
        throw new Error("NOT_FOUND");
      }

      const creditData = creditSnap.data()!;

      // ── 3. Only the recipient can apply the credit ──
      if (creditData.recipientUid !== auth.uid) {
        throw new Error("FORBIDDEN");
      }

      // ── 4. Prevent double-application ──
      if (creditData.status === "applied") {
        throw new Error("ALREADY_APPLIED");
      }

      // ── 5. Amount MUST come from the Firestore document, never from the body ──
      const creditAmount = Number(creditData.amount);
      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        throw new Error("INVALID_AMOUNT");
      }

      // ── 6. Atomically credit the recipient balance ──
      const recipientRef = adminDb.collection("moraliUsers").doc(auth.uid);
      const recipientSnap = await transaction.get(recipientRef);

      if (!recipientSnap.exists()) {
        throw new Error("RECIPIENT_NOT_FOUND");
      }

      const currentBal = Number(recipientSnap.data()?.balance) || 0;
      const newBal = currentBal + Math.round(creditAmount);

      transaction.update(recipientRef, {
        balance: newBal,
        updatedAt: new Date(),
      });

      // ── 7. Mark credit as applied ──
      transaction.update(creditRef, {
        status: "applied",
        appliedAt: new Date(),
        appliedBy: auth.uid,
      });

      return { credited: Math.round(creditAmount), newBalance: newBal };
    });

    // ── 8. Best-effort notification (non-blocking) ──
    const sanitize = (s: string, maxLen: number) =>
      String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

    try {
      const creditSnap = await creditRef.get();
      const creditData = creditSnap.data();
      await adminDb.collection("users").doc(auth.uid).collection("notifications").add({
        title: `Crédit reçu — FCFA ${result.credited.toLocaleString("fr-FR")}`,
        time: "À l'instant",
        badge: "Reçu", badgeClass: "nb-green", icon: "receive",
        bg: "rgba(34,197,94,0.12)", read: false,
        createdAt: new Date(),
        senderName: sanitize(creditData?.senderName || "", 100),
        senderMoraliId: sanitize(creditData?.senderMoraliId || "", 50),
        receiptId: sanitize(creditData?.receiptId || "", 50),
      });
    } catch {
      // Notification best-effort — don't fail the credit
    }

    return NextResponse.json({ success: true, credited: result.credited, newBalance: result.newBalance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Map transaction errors to appropriate HTTP responses
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Crédit en attente introuvable" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "Accès refusé — seul le destinataire peut appliquer ce crédit" }, { status: 403 });
    }
    if (msg === "ALREADY_APPLIED") {
      return NextResponse.json({ success: true, idempotent: true, message: "Crédit déjà appliqué" });
    }
    if (msg === "INVALID_AMOUNT") {
      return NextResponse.json({ error: "Montant du crédit invalide" }, { status: 400 });
    }
    if (msg === "RECIPIENT_NOT_FOUND") {
      return NextResponse.json({ error: "Destinataire introuvable" }, { status: 404 });
    }

    console.error("[pending-credit:PUT] Operation failed:", err);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
