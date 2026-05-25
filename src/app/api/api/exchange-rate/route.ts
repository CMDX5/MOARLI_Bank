import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

// TODO: Integrate real exchange rate API (e.g., Fixer.io, Open Exchange Rates, XE API)
// For CFA (XAF) currencies: 1 XAF = fixed peg to EUR (1 EUR = 655.957 XAF)
// Common pairs needed: XAF/USD, XAF/EUR, XAF/CNY

// Cache to avoid hammering the free API (update every 10 min)
let cachedRates: { base: string; rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

// Real API: frankfurter.app (free, no key, European Central Bank data)
const FRANKFURTER_API = "https://api.frankfurter.app/latest";

const VALID_CODES = ["EUR", "USD", "XAF", "XOF", "GBP", "CHF", "CAD", "JPY", "CNY", "GNF", "KMF"];

// CFA franc peg to EUR
const EUR_XAF = 655.957;

/**
 * GET /api/exchange-rate?from=XAF&to=EUR
 * Returns: { rate: number, source: "ecb", timestamp: string }
 */
export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per 60 seconds
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`exchange-rate:${clientId}`, { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  try {
    const from = (req.nextUrl.searchParams.get("from") || "EUR").toUpperCase();
    const to = (req.nextUrl.searchParams.get("to") || "USD").toUpperCase();

    if (!VALID_CODES.includes(from) || !VALID_CODES.includes(to)) {
      return NextResponse.json({ error: "Devise non supportée" }, { status: 400 });
    }

    const rates = await getRates();
    if (!rates) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    // Convert via EUR base (frankfurter uses EUR as base)
    const fromToEUR = from === "EUR" ? 1 : from === "XAF" ? 1 / EUR_XAF : rates.rates[from];
    const eurToTo = to === "EUR" ? 1 : to === "XAF" ? EUR_XAF : rates.rates[to];

    if (!fromToEUR || !eurToTo) {
      return NextResponse.json({ error: "Taux non disponible" }, { status: 404 });
    }

    return NextResponse.json({
      rate: Math.round(fromToEUR * eurToTo * 10000) / 10000,
      source: "ecb",
      timestamp: new Date(rates.timestamp).toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

async function getRates() {
  if (cachedRates && Date.now() - cachedRates.timestamp < CACHE_TTL) {
    return cachedRates;
  }
  try {
    const res = await fetch(FRANKFURTER_API);
    if (!res.ok) return cachedRates; // Return stale cache
    const data = await res.json();
    cachedRates = { base: data.base, rates: data.rates, timestamp: Date.now() };
    return cachedRates;
  } catch {
    return cachedRates;
  }
}
