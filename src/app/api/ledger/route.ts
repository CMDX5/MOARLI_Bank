import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { captureError } from "@/lib/sentry";
import {
  DEFAULT_FX_RATES,
  MAX_CASH_MOVEMENT,
  acceptQuotedRate,
  quoteExchange,
  serverWithdrawalFee,
} from "@/lib/ledger";

/**
 * POST /api/ledger
 *
 * The only path a signed-in user has to move their own balances.
 * Cash deposits credit the caller (the in-app Mobile Money screen has no
 * payment-provider handshake). They are rejected on POST /api/transactions/create.
 * Withdrawals, savings transfers and FX never trust a client-supplied balance.
 */

const sanitize = (s: string, maxLen: number) =>
  String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "");

type LedgerBody = {
  op?: string;
  amount?: number;
  receiptId?: string;
  channel?: string;
  applyFee?: boolean;
  direction?: string;
  currency?: string;
  quotedRate?: number;
  senderName?: string;
  senderMoraliId?: string;
};

async function serverFxRate(currency: "EUR" | "USD"): Promise<number> {
  if (currency === "EUR") return DEFAULT_FX_RATES.EUR;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return DEFAULT_FX_RATES.USD;
    const data = await res.json();
    const usdPerEur = Number(data?.rates?.USD);
    if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) return DEFAULT_FX_RATES.USD;
    return usdPerEur / 655.957;
  } catch {
    return DEFAULT_FX_RATES.USD;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "ledger", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  let body: LedgerBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const op = body.op;
  const receiptId = sanitize(String(body.receiptId || ""), 40);
  if (!receiptId || !/^[A-Za-z0-9_-]{4,40}$/.test(receiptId)) {
    return NextResponse.json({ error: "Reçu invalide" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_CASH_MOVEMENT) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  const uid = auth.uid;
  const lockRef = adminDb.collection("txLocks").doc(`ledger_${uid}_${receiptId.replace(/[^a-zA-Z0-9_-]/g, "_")}`);

  try {
    if (op === "deposit" || op === "withdraw") {
      const channel = body.channel === "service" ? "service" : "momo";
      const principal = Math.round(amount);
      if (principal <= 0) {
        return NextResponse.json({ error: "Montant invalide", code: "INVALID_AMOUNT" }, { status: 400 });
      }
      const fee = op === "withdraw" ? serverWithdrawalFee(principal, channel, body.applyFee === true) : 0;
      const result = await adminDb.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.data()?.result) {
          return { duplicate: true, ...(lockSnap.data()?.result as Record<string, unknown>) };
        }
        const userRef = adminDb.collection("moraliUsers").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error("USER_NOT_FOUND");
        const data = userSnap.data() || {};
        if (data.accountStatus === "suspended") throw new Error("ACCOUNT_SUSPENDED");
        const balance = Number(data.balance) || 0;
        const delta = op === "deposit" ? principal : -(principal + fee);
        if (op === "withdraw" && balance < principal + fee) throw new Error("INSUFFICIENT_BALANCE");
        const newBalance = balance + delta;
        const txRef = adminDb.collection("transactions").doc();
        const name = sanitize(String(data.fullName || data.name || body.senderName || "Utilisateur"), 100);
        const moraliId = sanitize(String(data.moraliId || body.senderMoraliId || ""), 50);
        tx.update(userRef, { balance: newBalance, updatedAt: new Date() });
        tx.set(txRef, {
          receiptId,
          senderUid: uid,
          senderMoraliId: moraliId,
          senderName: name,
          recipientUid: uid,
          recipientMoraliId: moraliId,
          recipientName: name,
          amount: principal,
          fees: fee,
          type: op === "deposit" ? "depot" : "retrait",
          destination: "cash",
          status: "success",
          createdAt: new Date(),
        });
        if (fee > 0) {
          const revRef = adminDb.collection("bankRevenue").doc();
          tx.set(revRef, {
            type: channel === "momo" ? "withdrawal_fee" : "service_fee",
            amount: fee,
            sourceUid: uid,
            sourceName: name,
            referenceId: receiptId,
            description: `Frais ${op === "withdraw" ? "de retrait" : "de service"} (2%) — ${principal} FCFA`,
            currency: "FCFA",
            createdAt: new Date(),
          });
        }
        const result = { success: true, balance: newBalance, fee, transactionId: txRef.id };
        tx.set(lockRef, { receiptId, result, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        return result;
      });
      return NextResponse.json(result);
    }

    if (op === "savings") {
      const direction = body.direction === "withdraw" ? "withdraw" : "deposit";
      const principal = Math.round(amount);
      if (principal <= 0) {
        return NextResponse.json({ error: "Montant invalide", code: "INVALID_AMOUNT" }, { status: 400 });
      }
      const result = await adminDb.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.data()?.result) {
          return { duplicate: true, ...(lockSnap.data()?.result as Record<string, unknown>) };
        }
        const userRef = adminDb.collection("moraliUsers").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error("USER_NOT_FOUND");
        const data = userSnap.data() || {};
        if (data.accountStatus === "suspended") throw new Error("ACCOUNT_SUSPENDED");
        const balance = Number(data.balance) || 0;
        const savings = Number(data.savingsBalance) || 0;
        if (direction === "deposit" && balance < principal) throw new Error("INSUFFICIENT_BALANCE");
        if (direction === "withdraw" && savings < principal) throw new Error("INSUFFICIENT_SAVINGS");
        const newBalance = direction === "deposit" ? balance - principal : balance + principal;
        const newSavings = direction === "deposit" ? savings + principal : savings - principal;
        const txRef = adminDb.collection("transactions").doc();
        const name = sanitize(String(data.fullName || data.name || "Utilisateur"), 100);
        const moraliId = sanitize(String(data.moraliId || ""), 50);
        tx.update(userRef, { balance: newBalance, savingsBalance: newSavings, updatedAt: new Date() });
        tx.set(txRef, {
          receiptId,
          senderUid: uid,
          senderMoraliId: moraliId,
          senderName: name,
          recipientUid: uid,
          recipientMoraliId: moraliId,
          recipientName: name,
          amount: principal,
          fees: 0,
          type: direction === "deposit" ? "depot" : "retrait",
          destination: "savings",
          status: "success",
          createdAt: new Date(),
        });
        const result = { success: true, balance: newBalance, savingsBalance: newSavings, transactionId: txRef.id };
        tx.set(lockRef, { receiptId, result, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        return result;
      });
      return NextResponse.json(result);
    }

    if (op === "exchange") {
      const direction = body.direction === "buy" ? "buy" : "sell";
      const currency = body.currency === "USD" ? "USD" : body.currency === "EUR" ? "EUR" : null;
      if (!currency) return NextResponse.json({ error: "Devise invalide" }, { status: 400 });
      const serverRate = await serverFxRate(currency);
      const rate = acceptQuotedRate(serverRate, body.quotedRate === undefined ? undefined : Number(body.quotedRate));
      const quote = quoteExchange({ direction, currency, amount, rate });
      const result = await adminDb.runTransaction(async (tx) => {
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists && lockSnap.data()?.result) {
          return { duplicate: true, ...(lockSnap.data()?.result as Record<string, unknown>) };
        }
        const userRef = adminDb.collection("moraliUsers").doc(uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error("USER_NOT_FOUND");
        const data = userSnap.data() || {};
        if (data.accountStatus === "suspended") throw new Error("ACCOUNT_SUSPENDED");
        const balance = Number(data.balance) || 0;
        const walletField = currency === "EUR" ? "eurWallet" : "usdWallet";
        const wallet = Number(data[walletField]) || 0;
        if (direction === "sell" && balance < quote.debit) throw new Error("INSUFFICIENT_BALANCE");
        if (direction === "buy" && wallet < quote.debit) throw new Error("INSUFFICIENT_BALANCE");
        const newBalance = direction === "sell" ? balance - quote.debit : balance + quote.converted;
        const newWallet = direction === "sell" ? wallet + quote.converted : wallet - quote.debit;
        const txRef = adminDb.collection("transactions").doc();
        const name = sanitize(String(data.fullName || data.name || "Utilisateur"), 100);
        const moraliId = sanitize(String(data.moraliId || ""), 50);
        tx.update(userRef, { balance: newBalance, [walletField]: newWallet, updatedAt: new Date() });
        tx.set(txRef, {
          receiptId,
          senderUid: uid,
          senderMoraliId: moraliId,
          senderName: name,
          recipientUid: uid,
          recipientMoraliId: moraliId,
          recipientName: name,
          amount: direction === "sell" ? quote.debit : quote.converted,
          fees: quote.feeXaf,
          type: direction === "sell" ? "retrait" : "depot",
          destination: "cash",
          status: "success",
          createdAt: new Date(),
        });
        if (quote.feeXaf > 0) {
          tx.set(adminDb.collection("bankRevenue").doc(), {
            type: "exchange_fee",
            amount: quote.feeXaf,
            sourceUid: uid,
            sourceName: name,
            referenceId: receiptId,
            description: `Commission change ${direction === "sell" ? "FCFA → " + currency : currency + " → FCFA"}`,
            currency: "FCFA",
            createdAt: new Date(),
          });
        }
        const result = {
          success: true,
          balance: newBalance,
          [walletField]: newWallet,
          converted: quote.converted,
          fee: quote.feeXaf,
          currency,
          transactionId: txRef.id,
        };
        tx.set(lockRef, { receiptId, result, createdAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        return result;
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Opération inconnue" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const mapped: Record<string, { status: number; error: string; code: string }> = {
      USER_NOT_FOUND: { status: 404, error: "Profil utilisateur introuvable", code: "USER_NOT_FOUND" },
      ACCOUNT_SUSPENDED: { status: 403, error: "Votre compte est suspendu. Opération impossible.", code: "ACCOUNT_SUSPENDED" },
      INSUFFICIENT_BALANCE: { status: 400, error: "Solde insuffisant", code: "INSUFFICIENT_BALANCE" },
      INSUFFICIENT_SAVINGS: { status: 400, error: "Solde épargne insuffisant", code: "INSUFFICIENT_SAVINGS" },
      INVALID_AMOUNT: { status: 400, error: "Montant invalide", code: "INVALID_AMOUNT" },
      RATE_UNAVAILABLE: { status: 503, error: "Taux indisponible", code: "RATE_UNAVAILABLE" },
    };
    const hit = mapped[msg];
    if (hit) return NextResponse.json({ error: hit.error, code: hit.code }, { status: hit.status });
    captureError(err, { action: "ledger", route: "/api/ledger", uid });
    return NextResponse.json({ error: "Opération impossible" }, { status: 500 });
  }
}
