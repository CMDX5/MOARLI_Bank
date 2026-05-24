import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { auditLog, AUDIT_ACTIONS, getClientIp } from "@/lib/audit-log";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Money Request API
 *
 * Handles money requests between users:
 * - POST (no action):    Create a money request
 * - POST (action: pay):  Fulfill / pay a pending money request
 * - POST (action: cancel): Cancel a pending money request
 * - GET:                  List pending money requests for the current user
 *
 * Terminology:
 * - senderUid   = the person ASKING for money (requester)
 * - recipientUid = the person BEING ASKED (target / payer)
 *
 * When paying, the payer (current user) must be the recipientUid of the request.
 */

const REQUEST_CAP = 1_000_000; // 1M FCFA max per money request

const sanitize = (s: string, maxLen: number) =>
  String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

// ─── GET: List pending money requests ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  try {
    // Requests where I am the TARGET (someone asked me for money)
    const incomingSnap = await adminDb
      .collection("moneyRequests")
      .where("recipientUid", "==", auth.uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    // Requests where I am the REQUESTER (I asked someone for money)
    const outgoingSnap = await adminDb
      .collection("moneyRequests")
      .where("senderUid", "==", auth.uid)
      .where("status", "==", "pending")
      .orderBy("createdAt", "desc")
      .get();

    const formatDoc = (doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const d = doc.data();
      return {
        id: doc.id,
        senderUid: d.senderUid || "",
        senderName: d.senderName || "",
        senderMoraliId: d.senderMoraliId || "",
        recipientUid: d.recipientUid || "",
        amount: d.amount || 0,
        message: d.message || "",
        status: d.status || "pending",
        createdAt: d.createdAt?.toDate?.()?.getTime?.() ?? d.createdAt ?? null,
      };
    };

    return NextResponse.json({
      success: true,
      incoming: incomingSnap.docs.map(formatDoc),
      outgoing: outgoingSnap.docs.map(formatDoc),
    });
  } catch (err) {
    console.error("[money-request] GET failed:", err);
    return NextResponse.json(
      { error: "Erreur de chargement des demandes" },
      { status: 500 }
    );
  }
}

// ─── POST: Create / Pay / Cancel a money request ───────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth check ──
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── 2. Rate limit: 15 requests/min per user ──
  const rl = await rateLimit(auth.uid, "money-request", {
    maxRequests: 15,
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

  // ── 3. Parse body ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  const action = sanitize(String(body.action ?? ""), 20);

  // ── Route by action ──
  if (action === "pay") {
    return handlePay(req, body, auth.uid!);
  }
  if (action === "cancel") {
    return handleCancel(req, body, auth.uid!);
  }

  // Default: create a new money request
  return handleCreate(req, body, auth.uid!);
}

// ─── CREATE: New money request ─────────────────────────────────────────────────

async function handleCreate(
  req: NextRequest,
  body: Record<string, unknown>,
  uid: string
) {
  const {
    recipientUid,
    amount,
    message,
    senderName,
    senderMoraliId,
  } = body as {
    recipientUid?: string;
    amount?: number;
    message?: string;
    senderName?: string;
    senderMoraliId?: string;
  };

  // Validate required fields
  if (!recipientUid || amount === undefined || amount === null) {
    return NextResponse.json(
      { error: "Paramètres manquants (recipientUid, amount requis)" },
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
  if (numericAmount > REQUEST_CAP) {
    return NextResponse.json(
      {
        error: `Montant maximum : ${REQUEST_CAP.toLocaleString("fr-FR")} FCFA`,
      },
      { status: 400 }
    );
  }

  // Prevent self-request
  if (recipientUid === uid) {
    return NextResponse.json(
      { error: "Impossible de faire une demande à vous-même" },
      { status: 400 }
    );
  }

  const cleanAmount = Math.round(numericAmount);

  // Get Admin Firestore
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  try {
    // Create the money request document
    const requestRef = adminDb.collection("moneyRequests").doc();
    const requestId = requestRef.id;
    const formattedAmount = cleanAmount.toLocaleString("fr-FR");
    const displayName = sanitize(senderName || "", 100);

    await requestRef.set({
      senderUid: uid,
      senderName: displayName,
      senderMoraliId: sanitize(senderMoraliId || "", 50),
      recipientUid,
      amount: cleanAmount,
      message: sanitize(message || "", 500),
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    // ── Notify the recipient ──
    try {
      const now = new Date().toLocaleString("fr-FR", {
        timeZone: "Africa/Brazzaville",
      });
      const notifTitle = `Demande de ${displayName} — ${formattedAmount} FCFA`;
      const notifData = {
        title: notifTitle,
        time: now,
        badge: "Demande",
        badgeClass: "nb-gold",
        icon: "request",
        bg: "rgba(251,191,36,0.12)",
        read: false,
        createdAt: new Date(),
        senderUid: uid,
        senderName: displayName,
        moneyRequestId: requestId,
      };

      // Primary: write to user's notifications subcollection
      await adminDb
        .collection("users")
        .doc(recipientUid)
        .collection("notifications")
        .add(notifData);

      // Fallback: also write to serverNotifications for the client-side listener
      await adminDb.collection("serverNotifications").add({
        ...notifData,
        targetUid: recipientUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifErr) {
      // Notifications are best-effort — never block the request creation
      console.error("[money-request:create] Notification delivery failed:", notifErr);
    }

    auditLog({
      uid,
      action: "money_request:create",
      details: { requestId, recipientUid, amount: cleanAmount },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({ success: true, requestId });
  } catch (err) {
    console.error("[money-request:create] Failed:", err);

    auditLog({
      uid,
      action: "money_request:create_failed",
      details: { recipientUid, amount: cleanAmount, error: String(err) },
      ip: getClientIp(req),
      level: "warning",
    }).catch(() => {});

    return NextResponse.json(
      { error: "Erreur lors de la création de la demande" },
      { status: 500 }
    );
  }
}

// ─── PAY: Fulfill a money request ───────────────────────────────────────────────

async function handlePay(
  req: NextRequest,
  body: Record<string, unknown>,
  uid: string
) {
  const { requestId, senderUid: bodySenderUid } = body as {
    requestId?: string;
    senderUid?: string;
  };

  if (!requestId) {
    return NextResponse.json(
      { error: "Identifiant de demande requis" },
      { status: 400 }
    );
  }

  // Validate requestId format
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
    return NextResponse.json(
      { error: "Identifiant de demande invalide" },
      { status: 400 }
    );
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      // ── Read the money request ──
      const requestRef = adminDb
        .collection("moneyRequests")
        .doc(requestId);
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      const requestData = requestSnap.data()!;

      // Verify status is pending
      if (requestData.status !== "pending") {
        throw new Error("REQUEST_NOT_PENDING");
      }

      // Verify the payer is the recipientUid of the request
      // (the person who was asked for money is the one paying)
      if (requestData.recipientUid !== uid) {
        throw new Error("NOT_AUTHORIZED_TO_PAY");
      }

      const requestAmount = Number(requestData.amount) || 0;
      const requesterUid = requestData.senderUid;

      // ── Read payer document (the person who received the request) ──
      const payerRef = adminDb.collection("moraliUsers").doc(uid);
      const payerSnap = await transaction.get(payerRef);

      let payerData: Record<string, unknown>;
      let payerBalance: number;

      if (!payerSnap.exists) {
        throw new Error("PAYER_ACCOUNT_NOT_FOUND");
      } else {
        payerData = payerSnap.data()!;
        if (payerData.accountStatus === "suspended") {
          throw new Error("ACCOUNT_SUSPENDED");
        }
        payerBalance = Number(payerData.balance) || 0;
      }

      if (payerBalance < requestAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // ── Read requester document (the person who asked for money) ──
      const requesterRef = adminDb.collection("moraliUsers").doc(requesterUid);
      const requesterSnap = await transaction.get(requesterRef);

      let requesterData: Record<string, unknown>;
      let requesterBalance: number;

      if (!requesterSnap.exists) {
        // Auto-create requester profile if it doesn't exist
        transaction.set(requesterRef, {
          uid: requesterUid,
          email: "",
          fullName: requestData.senderName || "Utilisateur",
          balance: 0,
          savingsAmount: 0,
          totalSent: 0,
          totalReceived: 0,
          accountStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        requesterData = {
          fullName: requestData.senderName || "Utilisateur",
          moraliId: requestData.senderMoraliId || "",
          name: requestData.senderName || "Utilisateur",
        };
        requesterBalance = 0;
      } else {
        requesterData = requesterSnap.data()!;
        requesterBalance = Number(requesterData.balance) || 0;
      }

      // ── Debit payer (recipientUid) ──
      const newPayerBalance = payerBalance - requestAmount;
      transaction.update(payerRef, {
        balance: newPayerBalance,
        totalSent: FieldValue.increment(requestAmount),
        updatedAt: new Date(),
      });

      // ── Credit requester (senderUid) ──
      const newRequesterBalance = requesterBalance + requestAmount;
      transaction.update(requesterRef, {
        balance: newRequesterBalance,
        totalReceived: FieldValue.increment(requestAmount),
        updatedAt: new Date(),
      });

      // ── Update money request status to "paid" ──
      transaction.update(requestRef, {
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        paidByUid: uid,
      });

      // ── Create transaction record for the payer ──
      const payerTxnRef = adminDb.collection("transactions").doc();
      transaction.set(payerTxnRef, {
        senderUid: uid,
        senderMoraliId: sanitize(
          String(payerData.moraliId || ""),
          50
        ),
        senderName: sanitize(
          String(payerData.fullName || payerData.name || "Utilisateur"),
          100
        ),
        recipientUid: requesterUid,
        recipientMoraliId: sanitize(
          String(
            requesterData.moraliId || requestData.senderMoraliId || ""
          ),
          50
        ),
        recipientName: sanitize(
          String(
            requesterData.fullName ||
              requesterData.name ||
              requestData.senderName ||
              "Utilisateur"
          ),
          100
        ),
        amount: requestAmount,
        fees: 0,
        type: "money_request_payment",
        status: "success",
        moneyRequestId: requestId,
        createdAt: new Date(),
      });

      // ── Create transaction record for the requester ──
      const requesterTxnRef = adminDb.collection("transactions").doc();
      transaction.set(requesterTxnRef, {
        senderUid: uid,
        senderName: sanitize(
          String(payerData.fullName || payerData.name || "Utilisateur"),
          100
        ),
        senderMoraliId: sanitize(
          String(payerData.moraliId || ""),
          50
        ),
        recipientUid: requesterUid,
        recipientMoraliId: sanitize(
          String(
            requesterData.moraliId || requestData.senderMoraliId || ""
          ),
          50
        ),
        recipientName: sanitize(
          String(
            requesterData.fullName ||
              requesterData.name ||
              requestData.senderName ||
              "Utilisateur"
          ),
          100
        ),
        amount: requestAmount,
        fees: 0,
        type: "money_request_received",
        status: "success",
        moneyRequestId: requestId,
        createdAt: new Date(),
      });

      return {
        newPayerBalance,
        newRequesterBalance,
        payerTxnId: payerTxnRef.id,
        requesterTxnId: requesterTxnRef.id,
        requesterName:
          requesterData.fullName ||
          requesterData.name ||
          requestData.senderName ||
          "Utilisateur",
        payerName:
          payerData.fullName || payerData.name || "Utilisateur",
      };
    });

    // ── Notify both users (best-effort) ──
    try {
      const formattedAmount = Number(
        (await adminDb
          .collection("moneyRequests")
          .doc(requestId)
          .get())
          .data()?.amount || 0
      ).toLocaleString("fr-FR");
      const now = new Date().toLocaleString("fr-FR", {
        timeZone: "Africa/Brazzaville",
      });
      const requesterUid = bodySenderUid || "";

      // Recipient (requester) notification: "Votre demande a été satisfaite"
      const recipientNotif = {
        title: `Demande satisfaite — ${formattedAmount} FCFA par ${result.payerName}`,
        time: now,
        badge: "Reçu",
        badgeClass: "nb-green",
        icon: "receive",
        bg: "rgba(34,197,94,0.12)",
        read: false,
        createdAt: new Date(),
        senderUid: uid,
        senderName: result.payerName,
        moneyRequestId: requestId,
      };

      await adminDb
        .collection("users")
        .doc(requesterUid)
        .collection("notifications")
        .add(recipientNotif);

      await adminDb.collection("serverNotifications").add({
        ...recipientNotif,
        targetUid: requesterUid,
        createdAt: FieldValue.serverTimestamp(),
      });

      // Payer notification: "Vous avez payé une demande"
      const payerNotif = {
        title: `Demande payée — ${formattedAmount} FCFA à ${result.requesterName}`,
        time: now,
        badge: "Envoyé",
        badgeClass: "nb-blue",
        icon: "send",
        bg: "rgba(59,130,246,0.12)",
        read: false,
        createdAt: new Date(),
        recipientUid: requesterUid,
        moneyRequestId: requestId,
      };

      await adminDb
        .collection("users")
        .doc(uid)
        .collection("notifications")
        .add(payerNotif);

      await adminDb.collection("serverNotifications").add({
        ...payerNotif,
        targetUid: uid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifErr) {
      console.error(
        "[money-request:pay] Notification delivery failed:",
        notifErr
      );
    }

    auditLog({
      uid,
      action: "money_request:pay",
      details: {
        requestId,
        amount: result.newPayerBalance,
        requesterUid: bodySenderUid,
      },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const errorMap: Record<string, { status: number; error: string }> = {
      REQUEST_NOT_FOUND: {
        status: 404,
        error: "Demande introuvable",
      },
      REQUEST_NOT_PENDING: {
        status: 400,
        error: "Cette demande n'est plus en attente",
      },
      NOT_AUTHORIZED_TO_PAY: {
        status: 403,
        error: "Vous n'êtes pas autorisé à payer cette demande",
      },
      PAYER_ACCOUNT_NOT_FOUND: {
        status: 404,
        error: "Compte non trouvé",
      },
      ACCOUNT_SUSPENDED: {
        status: 403,
        error: "Votre compte est suspendu. Opération impossible.",
      },
      INSUFFICIENT_BALANCE: {
        status: 400,
        error: "Solde insuffisant pour payer cette demande",
      },
    };

    const mapped = errorMap[msg];
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    console.error("[money-request:pay] Transaction failed:", err);

    auditLog({
      uid,
      action: "money_request:pay_failed",
      details: { requestId, error: msg },
      ip: getClientIp(req),
      level: "warning",
    }).catch(() => {});

    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

// ─── CANCEL: Cancel a money request ─────────────────────────────────────────────

async function handleCancel(
  req: NextRequest,
  body: Record<string, unknown>,
  uid: string
) {
  const { requestId } = body as {
    requestId?: string;
  };

  if (!requestId) {
    return NextResponse.json(
      { error: "Identifiant de demande requis" },
      { status: 400 }
    );
  }

  // Validate requestId format
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
    return NextResponse.json(
      { error: "Identifiant de demande invalide" },
      { status: 400 }
    );
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json(
      { error: "Service indisponible" },
      { status: 503 }
    );
  }

  try {
    const requestRef = adminDb
      .collection("moneyRequests")
      .doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return NextResponse.json(
        { error: "Demande introuvable" },
        { status: 404 }
      );
    }

    const requestData = requestSnap.data()!;

    // Verify the requester is the one cancelling
    if (requestData.senderUid !== uid) {
      return NextResponse.json(
        { error: "Seul l'auteur de la demande peut l'annuler" },
        { status: 403 }
      );
    }

    // Verify status is pending
    if (requestData.status !== "pending") {
      return NextResponse.json(
        { error: "Cette demande n'est plus en attente" },
        { status: 400 }
      );
    }

    // Update status to cancelled
    await requestRef.update({
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
    });

    // ── Notify the recipient that the request was cancelled (best-effort) ──
    try {
      const formattedAmount = Number(requestData.amount || 0).toLocaleString(
        "fr-FR"
      );
      const now = new Date().toLocaleString("fr-FR", {
        timeZone: "Africa/Brazzaville",
      });

      const notifData = {
        title: `Demande annulée — ${formattedAmount} FCFA`,
        time: now,
        badge: "Annulé",
        badgeClass: "nb-red",
        icon: "close",
        bg: "rgba(239,68,68,0.12)",
        read: false,
        createdAt: new Date(),
        senderUid: uid,
        senderName: requestData.senderName || "",
        moneyRequestId: requestId,
      };

      const recipientUid = requestData.recipientUid;

      await adminDb
        .collection("users")
        .doc(recipientUid)
        .collection("notifications")
        .add(notifData);

      await adminDb.collection("serverNotifications").add({
        ...notifData,
        targetUid: recipientUid,
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (notifErr) {
      console.error(
        "[money-request:cancel] Notification delivery failed:",
        notifErr
      );
    }

    auditLog({
      uid,
      action: "money_request:cancel",
      details: { requestId },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[money-request:cancel] Failed:", err);

    auditLog({
      uid,
      action: "money_request:cancel_failed",
      details: { requestId, error: String(err) },
      ip: getClientIp(req),
      level: "warning",
    }).catch(() => {});

    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
