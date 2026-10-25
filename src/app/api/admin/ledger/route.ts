import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth-verify";

/**
 * Admin-only balance and account mutations.
 * Custom claims required. Firestore role is not consulted.
 */

const sanitize = (s: string, maxLen: number) =>
  String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "admin:ledger", { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const action = String(body.action || "");

  try {
    if (action === "status") {
      const uid = String(body.uid || "");
      const accountStatus = body.accountStatus === "suspended" ? "suspended" : body.accountStatus === "active" ? "active" : null;
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !accountStatus) {
        return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
      }
      await adminDb.collection("moraliUsers").doc(uid).set({ accountStatus, updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ success: true, accountStatus });
    }

    if (action === "pin-reset-flag") {
      const uid = String(body.uid || "");
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
        return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
      }
      await adminDb.collection("moraliUsers").doc(uid).set({ pinResetRequired: true, updatedAt: new Date() }, { merge: true });
      return NextResponse.json({ success: true });
    }

    if (action === "refund") {
      const senderUid = String(body.senderUid || "");
      const recipientUid = String(body.recipientUid || "");
      const amount = Math.round(Number(body.amount));
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(senderUid) || !/^[a-zA-Z0-9_-]{1,128}$/.test(recipientUid)) {
        return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 5_000_000) {
        return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
      }
      const result = await adminDb.runTransaction(async (tx) => {
        const senderRef = adminDb.collection("moraliUsers").doc(senderUid);
        const senderSnap = await tx.get(senderRef);
        if (!senderSnap.exists) throw new Error("SENDER_NOT_FOUND");
        if (recipientUid === senderUid) {
          const balance = Number(senderSnap.data()?.balance) || 0;
          tx.update(senderRef, { balance: balance + amount, updatedAt: new Date() });
        } else {
          const recipientRef = adminDb.collection("moraliUsers").doc(recipientUid);
          const recipientSnap = await tx.get(recipientRef);
          if (!recipientSnap.exists) throw new Error("RECIPIENT_NOT_FOUND");
          const recipientBal = Number(recipientSnap.data()?.balance) || 0;
          if (recipientBal < amount) throw new Error("INSUFFICIENT_BALANCE");
          const senderBal = Number(senderSnap.data()?.balance) || 0;
          tx.update(recipientRef, { balance: recipientBal - amount, updatedAt: new Date() });
          tx.update(senderRef, { balance: senderBal + amount, updatedAt: new Date() });
        }
        const txRef = adminDb.collection("transactions").doc();
        tx.set(txRef, {
          senderUid: "admin",
          senderMoraliId: "admin",
          senderName: "Admin Morali",
          recipientUid: senderUid,
          recipientMoraliId: sanitize(String(senderSnap.data()?.moraliId || ""), 50),
          recipientName: sanitize(String(senderSnap.data()?.fullName || senderSnap.data()?.name || ""), 100),
          amount,
          fees: 0,
          type: "remboursement",
          status: "success",
          receiptId: `REF-${Date.now().toString().slice(-8)}`,
          createdAt: new Date(),
        });
        return { success: true };
      });
      return NextResponse.json(result);
    }

    if (action === "loan-approve" || action === "loan-reject") {
      const loanId = String(body.loanId || "");
      const senderUid = String(body.senderUid || "");
      const amount = Math.round(Number(body.amount));
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(loanId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(senderUid)) {
        return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
      }
      if (action === "loan-reject") {
        await adminDb.collection("transactions").doc(loanId).set(
          { status: "contested", updatedAt: new Date() },
          { merge: true },
        );
        return NextResponse.json({ success: true });
      }
      if (!Number.isFinite(amount) || amount <= 0 || amount > 5_000_000) {
        return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
      }
      await adminDb.runTransaction(async (tx) => {
        const userRef = adminDb.collection("moraliUsers").doc(senderUid);
        const loanRef = adminDb.collection("transactions").doc(loanId);
        const userSnap = await tx.get(userRef);
        const loanSnap = await tx.get(loanRef);
        if (!userSnap.exists) throw new Error("USER_NOT_FOUND");
        if (!loanSnap.exists) throw new Error("NOT_FOUND");
        if (loanSnap.data()?.status === "success") throw new Error("ALREADY_APPLIED");
        const balance = Number(userSnap.data()?.balance) || 0;
        tx.update(userRef, { balance: balance + amount, updatedAt: new Date() });
        tx.update(loanRef, { status: "success", destination: "loan_granted", updatedAt: new Date() });
        tx.set(adminDb.collection("transactions").doc(), {
          senderUid: "admin",
          senderMoraliId: "MORALI-ADMIN",
          senderName: "Morali Pay",
          recipientUid: senderUid,
          recipientMoraliId: sanitize(String(body.senderMoraliId || userSnap.data()?.moraliId || ""), 50),
          recipientName: sanitize(String(body.senderName || userSnap.data()?.fullName || ""), 100),
          amount,
          fees: 0,
          type: "depot",
          destination: "loan_granted",
          status: "success",
          receiptId: `LN-${Date.now().toString().slice(-8)}`,
          createdAt: new Date(),
        });
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const mapped: Record<string, { status: number; error: string }> = {
      SENDER_NOT_FOUND: { status: 404, error: "Compte expéditeur introuvable" },
      RECIPIENT_NOT_FOUND: { status: 404, error: "Compte destinataire introuvable" },
      USER_NOT_FOUND: { status: 404, error: "Utilisateur introuvable" },
      NOT_FOUND: { status: 404, error: "Demande introuvable" },
      INSUFFICIENT_BALANCE: { status: 400, error: "Solde insuffisant" },
      ALREADY_APPLIED: { status: 409, error: "Déjà approuvé" },
    };
    if (mapped[msg]) return NextResponse.json({ error: mapped[msg].error }, { status: mapped[msg].status });
    console.error("[admin:ledger]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
