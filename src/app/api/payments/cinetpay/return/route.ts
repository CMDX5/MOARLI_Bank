import { NextRequest, NextResponse } from "next/server";
import { isValidTransactionId, parseCinetpayBody } from "@/lib/cinetpay";

export const dynamic = "force-dynamic";

/**
 * CinetPay return URL.
 * GET with no body is their availability ping. POST carries transaction_id
 * and only redirects the browser to the status page. No balance change happens here.
 */
function redirectToStatus(req: NextRequest, transactionId: string) {
  const target = new URL("/depot/retour", req.nextUrl.origin);
  if (isValidTransactionId(transactionId)) {
    target.searchParams.set("transaction_id", transactionId);
  }
  return NextResponse.redirect(target, 303);
}

export async function GET(req: NextRequest) {
  const transactionId = req.nextUrl.searchParams.get("transaction_id")
    || req.nextUrl.searchParams.get("transactionId")
    || "";
  if (!transactionId) return NextResponse.json({ ok: true });
  return redirectToStatus(req, transactionId);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const fields = parseCinetpayBody(raw, req.headers.get("content-type"));
  const transactionId = fields.transaction_id || fields.transactionId || fields.cpm_trans_id || "";
  return redirectToStatus(req, transactionId);
}
