import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAuth } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";
import { captureError, captureSecurityEvent } from "@/lib/sentry";
import { cinetpayConfig, isValidTransactionId, requestCinetpayStatus } from "@/lib/cinetpay";
import { settleVerifiedPayment } from "@/lib/cinetpay-settle";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/cinetpay/status?transactionId=
 * Owner-only. Re-checks CinetPay while the payment is still pending and
 * credits through the same idempotent settlement as the webhook.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "cinetpay:status", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez plus tard." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const transactionId = req.nextUrl.searchParams.get("transactionId") || req.nextUrl.searchParams.get("transaction_id") || "";
  if (!isValidTransactionId(transactionId)) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  const payRef = adminDb.collection("cinetpayPayments").doc(transactionId);
  const snap = await payRef.get();
  if (!snap.exists || snap.data()?.uid !== auth.uid) {
    return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
  }

  const current = snap.data() || {};
  const terminal = current.credited === true || current.status === "refused";
  if (!terminal) {
    const config = cinetpayConfig();
    if (config) {
      try {
        const check = await requestCinetpayStatus(config, transactionId);
        if (check) {
          const settled = await settleVerifiedPayment(adminDb, transactionId, check);
          if (settled.outcome === "mismatch") {
            captureSecurityEvent("cinetpay_amount_mismatch", {
              uid: auth.uid,
              details: { transactionId, status: check.status, code: check.code },
            });
          }
        }
      } catch (err) {
        captureError(err, { action: "cinetpay:status", route: "/api/payments/cinetpay/status", uid: auth.uid });
      }
    }
  }

  const fresh = (await payRef.get()).data() || current;
  const status = fresh.credited === true
    ? "accepted"
    : fresh.status === "refused"
      ? "refused"
      : "pending";

  return NextResponse.json({
    status,
    credited: fresh.credited === true,
    amount: Number(fresh.amount) || 0,
    currency: String(fresh.currency || "XAF"),
    transactionId,
  });
}
