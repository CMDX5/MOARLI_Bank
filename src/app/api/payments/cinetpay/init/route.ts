import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAuth } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";
import { captureError } from "@/lib/sentry";
import {
  cinetpayConfig,
  newCinetpayTransactionId,
  normalizeCongoPhone,
  requestCinetpayCheckout,
  resolveAppBaseUrl,
  splitCustomerName,
  validateDepositAmount,
} from "@/lib/cinetpay";
import { attachCheckout, createPendingDeposit, markCheckoutFailed } from "@/lib/cinetpay-settle";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/cinetpay/init
 * Starts a CinetPay Mobile Money checkout. Does not change the balance.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "cinetpay:init", { maxRequests: 8, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const config = cinetpayConfig();
  const baseUrl = resolveAppBaseUrl(req.nextUrl.origin);
  if (!config || !baseUrl) {
    return NextResponse.json(
      { error: "Paiement Mobile Money indisponible. Réessayez plus tard.", code: "PAYMENT_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  let body: { amount?: unknown; phone?: unknown; operator?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const amount = Number(body.amount);
  const amountError = validateDepositAmount(amount);
  if (amountError) return NextResponse.json({ error: amountError, code: "INVALID_AMOUNT" }, { status: 400 });

  const phone = normalizeCongoPhone(String(body.phone || ""));
  if (!phone) {
    return NextResponse.json({ error: "Le numéro doit contenir 9 chiffres et commencer par 06 ou 05" }, { status: 400 });
  }
  const operator = body.operator === "airtel" ? "airtel" : "mtn";

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  const userSnap = await adminDb.collection("moraliUsers").doc(auth.uid).get();
  if (!userSnap.exists) {
    return NextResponse.json({ error: "Profil utilisateur introuvable", code: "USER_NOT_FOUND" }, { status: 404 });
  }
  const user = userSnap.data() || {};
  if (user.accountStatus === "suspended") {
    return NextResponse.json({ error: "Votre compte est suspendu. Opération impossible.", code: "ACCOUNT_SUSPENDED" }, { status: 403 });
  }

  const fullName = String(user.fullName || user.name || "Client Morali");
  const names = splitCustomerName(fullName);
  const transactionId = newCinetpayTransactionId();

  try {
    await createPendingDeposit(adminDb, {
      transactionId,
      uid: auth.uid,
      amount,
      currency: config.currency,
      phone,
      operator,
      moraliId: String(user.moraliId || ""),
      fullName,
    });

    const checkout = await requestCinetpayCheckout({
      config,
      transactionId,
      amount,
      description: "Depot Mobile Money Morali",
      notifyUrl: `${baseUrl}/api/webhooks/cinetpay`,
      returnUrl: `${baseUrl}/api/payments/cinetpay/return`,
      phone,
      customerName: names.name,
      customerSurname: names.surname,
      metadata: transactionId,
    });

    if (!checkout.ok) {
      await markCheckoutFailed(adminDb, transactionId, checkout.code);
      return NextResponse.json({ error: checkout.error, code: "CHECKOUT_FAILED" }, { status: 502 });
    }

    await attachCheckout(adminDb, transactionId, checkout.paymentToken).catch(() => {});
    return NextResponse.json({
      paymentUrl: checkout.paymentUrl,
      transactionId,
    });
  } catch (err) {
    captureError(err, { action: "cinetpay:init", route: "/api/payments/cinetpay/init", uid: auth.uid });
    return NextResponse.json({ error: "Paiement impossible pour le moment" }, { status: 500 });
  }
}
