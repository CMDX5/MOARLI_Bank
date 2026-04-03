import { NextRequest, NextResponse } from "next/server";
import { collection, addDoc, doc, getDoc, getDocs, deleteDoc, query, where, orderBy, limit as queryLimit } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit, getClientId } from "@/lib/rate-limit";
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
  // ── Rate limit: 60 reads/min ──
  const clientId = getClientId(req);
  const rl = rateLimit(`pending-credit:GET:${clientId}`, { maxRequests: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

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
  // ── Rate limit: 20 writes/min ──
  const clientId = getClientId(req);
  const rl = rateLimit(`pending-credit:POST:${clientId}`, { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

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
  // ── Rate limit: 30 deletes/min ──
  const clientId = getClientId(req);
  const rl = rateLimit(`pending-credit:DELETE:${clientId}`, { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

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

// PUT: Credit recipient balance directly (uses Admin SDK to bypass client rules)
export async function PUT(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimit(`pending-credit:PUT:${clientId}`, { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const { recipientUid, amount, senderName, senderMoraliId, receiptId } = body as {
      recipientUid?: string; amount?: number; senderName?: string; senderMoraliId?: string; receiptId?: string;
    };

    if (!recipientUid || !amount) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(recipientUid)) {
      return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
    }
    if (numericAmount > 1_000_000) {
      return NextResponse.json({ error: "Montant dépasse la limite (1M FCFA)" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    // Idempotency: check if this receiptId was already credited
    if (receiptId) {
      const existingTx = await adminDb.collection("serverTransactions")
        .where("receiptId", "==", String(receiptId))
        .limit(1).get();
      if (!existingTx.empty) {
        return NextResponse.json({ success: true, idempotent: true, credited: Math.round(numericAmount) });
      }
    }

    // Credit recipient balance directly via Admin SDK
    const recipientRef = adminDb.collection("moraliUsers").doc(recipientUid);
    const recipientDoc = await recipientRef.get();

    if (!recipientDoc.exists) {
      return NextResponse.json({ error: "Destinataire introuvable" }, { status: 404 });
    }

    const currentBal = recipientDoc.data()?.balance || 0;
    await recipientRef.update({
      balance: currentBal + Math.round(numericAmount),
      updatedAt: new Date(),
    });

    // Also create notification for recipient via server
    const sanitize = (s: string, maxLen: number) =>
      String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

    try {
      await adminDb.collection("users").doc(recipientUid).collection("notifications").add({
        title: `Virement reçu — FCFA ${Math.round(numericAmount).toLocaleString("fr-FR")}`,
        time: "À l'instant",
        badge: "Reçu", badgeClass: "nb-green", icon: "receive",
        bg: "rgba(34,197,94,0.12)", read: false,
        createdAt: new Date(),
        senderName: sanitize(senderName || "", 100),
        senderMoraliId: sanitize(senderMoraliId || "", 50),
        receiptId: sanitize(receiptId || "", 50),
      });
    } catch {
      // Notification best-effort
    }

    return NextResponse.json({ success: true, credited: Math.round(numericAmount) });
  } catch (err) {
    console.error("[pending-credit:PUT] Operation failed:", err);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
