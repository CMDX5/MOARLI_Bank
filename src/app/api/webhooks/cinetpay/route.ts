import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { getClientId, rateLimitByIp } from "@/lib/rate-limit";
import { captureError, captureSecurityEvent } from "@/lib/sentry";
import {
  cinetpayConfig,
  isValidTransactionId,
  parseCinetpayBody,
  requestCinetpayStatus,
  verifyCinetpayToken,
} from "@/lib/cinetpay";
import { settleVerifiedPayment } from "@/lib/cinetpay-settle";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/cinetpay
 * CinetPay notify URL. GET is the availability ping and does not credit anyone.
 * The posted amount is ignored. Credit happens only after the check-status call
 * agrees with the pending payment stored at init, and only once.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const rl = rateLimitByIp(`cinetpay:notify:${getClientId(req)}`, { maxRequests: 120, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const config = cinetpayConfig();
  if (!config) {
    captureError(new Error("CinetPay is not configured"), {
      action: "cinetpay:notify",
      route: "/api/webhooks/cinetpay",
    });
    return NextResponse.json({ error: "Paiement non configuré" }, { status: 503 });
  }

  const raw = await req.text();
  const fields = parseCinetpayBody(raw, req.headers.get("content-type"));
  const transactionId = fields.cpm_trans_id || fields.transaction_id || "";
  const siteId = fields.cpm_site_id || "";

  if (!isValidTransactionId(transactionId)) {
    return NextResponse.json({ received: true, processed: false, reason: "transaction_inconnue" });
  }
  if (siteId && siteId !== config.siteId) {
    captureSecurityEvent("cinetpay_site_mismatch", { details: { transactionId } });
    return NextResponse.json({ error: "Site invalide" }, { status: 401 });
  }

  if (config.secretKey) {
    const token = req.headers.get("x-token");
    if (!verifyCinetpayToken(fields, config.secretKey, token)) {
      captureSecurityEvent("cinetpay_invalid_token", { details: { transactionId } });
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const existing = await adminDb.collection("cinetpayPayments").doc(transactionId).get();
    if (!existing.exists) {
      return NextResponse.json({ received: true, processed: false, reason: "paiement_inconnu" });
    }
    if (existing.data()?.credited === true) {
      return NextResponse.json({ received: true, processed: false, duplicate: true });
    }

    const check = await requestCinetpayStatus(config, transactionId);
    if (!check) {
      return NextResponse.json({ error: "Vérification indisponible" }, { status: 503 });
    }

    const settled = await settleVerifiedPayment(adminDb, transactionId, check);
    if (settled.outcome === "mismatch") {
      captureSecurityEvent("cinetpay_amount_mismatch", {
        uid: String(existing.data()?.uid || ""),
        details: { transactionId, status: check.status, code: check.code },
      });
    }

    return NextResponse.json({
      received: true,
      processed: settled.outcome === "credit",
      duplicate: settled.outcome === "duplicate",
      status: settled.outcome,
    });
  } catch (err) {
    captureError(err, { action: "cinetpay:notify", route: "/api/webhooks/cinetpay", extra: { transactionId } });
    return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
  }
}
