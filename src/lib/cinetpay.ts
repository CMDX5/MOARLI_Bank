import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { MAX_CASH_MOVEMENT } from "@/lib/ledger";

/**
 * CinetPay Checkout API v2.
 * https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 * The balance is never taken from the notify body. The check endpoint is the source of truth.
 */

export const CINETPAY_INIT_URL = "https://api-checkout.cinetpay.com/v2/payment";
export const CINETPAY_CHECK_URL = "https://api-checkout.cinetpay.com/v2/payment/check";
export const CINETPAY_MIN_AMOUNT = 100;
export const CINETPAY_CURRENCIES = ["XAF", "XOF", "CDF", "GNF", "USD"] as const;

/** Field order required by the CinetPay x-token HMAC (no separators). */
export const CINETPAY_HMAC_FIELDS = [
  "cpm_site_id",
  "cpm_trans_id",
  "cpm_trans_date",
  "cpm_amount",
  "cpm_currency",
  "signature",
  "payment_method",
  "cel_phone_num",
  "cpm_phone_prefixe",
  "cpm_language",
  "cpm_version",
  "cpm_payment_config",
  "cpm_page_action",
  "cpm_custom",
  "cpm_designation",
  "cpm_error_message",
] as const;

export type CinetPayConfig = {
  apiKey: string;
  siteId: string;
  /** Empty when the merchant has not set a secret. HMAC is then skipped. */
  secretKey: string;
  currency: string;
};

export type CinetPayCheck = {
  code: string;
  status: string;
  amount: number;
  currency: string;
};

export type SettlementDecision = "credit" | "duplicate" | "pending" | "refused" | "mismatch";

export function cinetpayConfig(): CinetPayConfig | null {
  const apiKey = process.env.CINETPAY_API_KEY?.trim() || "";
  const siteId = process.env.CINETPAY_SITE_ID?.trim() || "";
  if (!apiKey || !siteId) return null;
  const requested = (process.env.CINETPAY_CURRENCY || "XAF").trim().toUpperCase();
  const currency = (CINETPAY_CURRENCIES as readonly string[]).includes(requested) ? requested : "XAF";
  return {
    apiKey,
    siteId,
    secretKey: process.env.CINETPAY_SECRET_KEY?.trim() || "",
    currency,
  };
}

/**
 * Public HTTPS origin CinetPay can call. APP_BASE_URL wins so the notify URL
 * stays on the production domain even when a preview deployment starts the payment.
 */
export function resolveAppBaseUrl(requestOrigin?: string | null): string | null {
  const fromEnv = (process.env.APP_BASE_URL || "").trim().replace(/\/$/, "");
  if (isAllowedAppBase(fromEnv)) return fromEnv;
  const vercel = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vercel) {
    const withProtocol = /^https?:\/\//i.test(vercel) ? vercel : `https://${vercel}`;
    if (isAllowedAppBase(withProtocol)) return withProtocol.replace(/\/$/, "");
  }
  const origin = (requestOrigin || "").trim().replace(/\/$/, "");
  if (isAllowedAppBase(origin)) return origin;
  return null;
}

function isAllowedAppBase(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function newCinetpayTransactionId(): string {
  return `mp${randomBytes(10).toString("hex")}`;
}

/** Congo (Brazzaville) mobile numbers used by the deposit screen: 05 / 06 + 7 digits. */
export function normalizeCongoPhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  const local = digits.startsWith("242") ? digits.slice(3) : digits;
  if (!/^(06|05)\d{7}$/.test(local)) return null;
  return local;
}

export function validateDepositAmount(amount: number, max = MAX_CASH_MOVEMENT): string | null {
  if (!Number.isInteger(amount) || amount < CINETPAY_MIN_AMOUNT || amount > max) {
    return "Le montant doit être un nombre entier entre 100 et 5 000 000 FCFA";
  }
  if (amount % 5 !== 0) {
    return "Le montant doit être un multiple de 5 FCFA";
  }
  return null;
}

export function cinetpayPlainText(value: string, max: number, fallback: string): string {
  const ascii = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (ascii || fallback).slice(0, max);
}

export function splitCustomerName(fullName: string): { name: string; surname: string } {
  const clean = cinetpayPlainText(fullName, 80, "");
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return { name: "Client", surname: "Morali" };
  if (parts.length === 1) return { name: parts[0].slice(0, 40), surname: "Morali" };
  return {
    surname: parts[0].slice(0, 40),
    name: parts.slice(1).join(" ").slice(0, 40),
  };
}

export function parseCinetpayBody(raw: string, contentType: string | null): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const asJson = (contentType || "").includes("application/json") || trimmed.startsWith("{");
  if (asJson) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(json)) {
        out[key] = value === null || value === undefined ? "" : String(value);
      }
      return out;
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(trimmed);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function cinetpayTokenData(fields: Record<string, string>): string {
  return CINETPAY_HMAC_FIELDS.map((key) => fields[key] ?? "").join("");
}

export function computeCinetpayToken(fields: Record<string, string>, secret: string): string {
  return createHmac("sha256", secret).update(cinetpayTokenData(fields), "utf8").digest("hex");
}

export function verifyCinetpayToken(
  fields: Record<string, string>,
  secret: string,
  received: string | null,
): boolean {
  if (!secret || !received) return false;
  const normalized = received.trim().toLowerCase().replace(/^sha256=/, "");
  const expected = computeCinetpayToken(fields, secret);
  const actual = Buffer.from(normalized);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

export function parseCheckResponse(body: unknown): CinetPayCheck | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  const data = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : {};
  const amountRaw = data.amount ?? rec.amount;
  const amount = typeof amountRaw === "number"
    ? amountRaw
    : Number(String(amountRaw ?? "").replace(/\s/g, "").replace(",", "."));
  return {
    code: String(rec.code ?? ""),
    status: String(data.status ?? "").trim().toUpperCase(),
    amount,
    currency: String(data.currency ?? "").trim().toUpperCase(),
  };
}

/**
 * Credit only when CinetPay's check says ACCEPTED (code 00) for the exact
 * amount and currency we stored at init. A second call is a duplicate.
 */
export function decideSettlement(input: {
  alreadyCredited: boolean;
  storedAmount: number;
  storedCurrency: string;
  check: CinetPayCheck;
}): SettlementDecision {
  if (input.alreadyCredited) return "duplicate";
  const status = input.check.status.toUpperCase();
  const code = input.check.code.trim();
  if (code === "00" && status === "ACCEPTED") {
    const paid = input.check.amount;
    const sameAmount = Number.isFinite(paid) && Math.abs(paid - input.storedAmount) < 0.001;
    const sameCurrency = input.check.currency === input.storedCurrency.toUpperCase();
    if (!sameAmount || !sameCurrency) return "mismatch";
    return "credit";
  }
  if (status === "REFUSED" || code === "627") return "refused";
  return "pending";
}

export function isValidTransactionId(value: string): boolean {
  return /^[A-Za-z0-9]{8,40}$/.test(value);
}

type CheckoutOk = { ok: true; paymentUrl: string; paymentToken: string };
type CheckoutErr = { ok: false; error: string; code: string };

export async function requestCinetpayCheckout(input: {
  config: CinetPayConfig;
  transactionId: string;
  amount: number;
  description: string;
  notifyUrl: string;
  returnUrl: string;
  phone: string;
  customerName: string;
  customerSurname: string;
  metadata: string;
}): Promise<CheckoutOk | CheckoutErr> {
  const names = {
    name: cinetpayPlainText(input.customerName, 40, "Client"),
    surname: cinetpayPlainText(input.customerSurname, 40, "Morali"),
  };
  const payload = {
    apikey: input.config.apiKey,
    site_id: input.config.siteId,
    transaction_id: input.transactionId,
    amount: input.amount,
    currency: input.config.currency,
    description: cinetpayPlainText(input.description, 80, "Depot Mobile Money Morali"),
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
    channels: "MOBILE_MONEY",
    lang: "fr",
    metadata: cinetpayPlainText(input.metadata, 80, "morali"),
    customer_name: names.name,
    customer_surname: names.surname,
    customer_phone_number: input.phone,
    lock_phone_number: true,
  };

  let body: unknown = null;
  try {
    const res = await fetch(CINETPAY_INIT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    body = await res.json().catch(() => null);
  } catch {
    return { ok: false, error: "Le service Mobile Money est injoignable", code: "NETWORK" };
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : {};
  const code = String(rec.code ?? "");
  const paymentUrl = typeof data.payment_url === "string" ? data.payment_url : "";
  if ((code === "201" || code === "200") && paymentUrl.startsWith("https://")) {
    return {
      ok: true,
      paymentUrl,
      paymentToken: typeof data.payment_token === "string" ? data.payment_token : "",
    };
  }
  return {
    ok: false,
    error: "Le paiement Mobile Money n'a pas pu démarrer",
    code: code || "INIT_FAILED",
  };
}

export async function requestCinetpayStatus(
  config: CinetPayConfig,
  transactionId: string,
): Promise<CinetPayCheck | null> {
  try {
    const res = await fetch(CINETPAY_CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apikey: config.apiKey,
        site_id: config.siteId,
        transaction_id: transactionId,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => null);
    return parseCheckResponse(body);
  } catch {
    return null;
  }
}
