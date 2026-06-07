import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

// Cache to avoid hammering the free API (update every 10 min)
let cachedRates: { base: string; rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

// Crypto cache (CoinGecko — free, no key)
let cachedCrypto: { usdtXaf: number; timestamp: number } | null = null;
const CRYPTO_CACHE_TTL = 5 * 60 * 1000;

// Real API: frankfurter.app (free, no key, European Central Bank data)
const FRANKFURTER_API = "https://api.frankfurter.app/latest";
// CoinGecko free API for crypto
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd";

const VALID_CODES = ["EUR", "USD", "XAF", "XOF", "GBP", "CHF", "CAD", "JPY", "CNY", "GNF", "KMF", "USDT"];

// CFA franc peg to EUR
const EUR_XAF = 655.957;

/**
 * GET /api/exchange-rate?from=XAF&to=EUR
 * GET /api/exchange-rate?all=true          — returns all rates at once
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
    const all = req.nextUrl.searchParams.get("all");

    // ── Bulk rates endpoint: returns all needed rates in one call ──
    if (all === "true") {
      const [fiatRates, cryptoData] = await Promise.all([
        getRates(),
        getCryptoRate(),
      ]);

      if (!fiatRates) {
        return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
      }

      // Calculate all XAF-based rates
      const usdRate = fiatRates.rates["USD"]; // 1 EUR = X USD
      const xafPerUsd = usdRate ? EUR_XAF / usdRate : null; // 1 USD = ? XAF
      const xafPerGbp = fiatRates.rates["GBP"] ? EUR_XAF / fiatRates.rates["GBP"] : null;

      return NextResponse.json({
        EUR_XAF: EUR_XAF,            // 1 EUR = 655.957 XAF (fixed peg)
        USD_XAF: xafPerUsd ? Math.round(xafPerUsd * 100) / 100 : null,  // 1 USD = ? XAF
        GBP_XAF: xafPerGbp ? Math.round(xafPerGbp * 100) / 100 : null,  // 1 GBP = ? XAF
        USDT_XAF: xafPerUsd ? Math.round(xafPerUsd * 100) / 100 : null, // USDT ≈ USD
        source: "ecb+coingecko",
        timestamp: new Date(Math.max(fiatRates.timestamp, cryptoData?.timestamp || 0)).toISOString(),
      });
    }

    // ── Single pair endpoint ──
    const from = (req.nextUrl.searchParams.get("from") || "EUR").toUpperCase();
    const to = (req.nextUrl.searchParams.get("to") || "USD").toUpperCase();

    if (!VALID_CODES.includes(from) || !VALID_CODES.includes(to)) {
      return NextResponse.json({ error: "Devise non supportée" }, { status: 400 });
    }

    // Handle crypto pairs
    if (from === "USDT" || to === "USDT") {
      const fiatRates = await getRates();
      const cryptoData = await getCryptoRate();
      if (!fiatRates) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

      const xafPerUsd = fiatRates.rates["USD"] ? EUR_XAF / fiatRates.rates["USD"] : EUR_XAF / 1.08;
      const usdtXaf = cryptoData?.usdtXaf || xafPerUsd;

      const fromXaf = from === "USDT" ? usdtXaf : from === "XAF" ? 1 : (fiatRates.rates[from] ? EUR_XAF / fiatRates.rates[from] : null);
      const toXaf = to === "USDT" ? usdtXaf : to === "XAF" ? 1 : (fiatRates.rates[to] ? EUR_XAF / fiatRates.rates[to] : null);

      if (!fromXaf || !toXaf) return NextResponse.json({ error: "Taux non disponible" }, { status: 404 });

      return NextResponse.json({
        rate: Math.round(fromXaf / toXaf * 10000) / 10000,
        source: "ecb+coingecko",
        timestamp: new Date().toISOString(),
      });
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
    const res = await fetch(FRANKFURTER_API, { cache: "no-store" });
    if (!res.ok) return cachedRates; // Return stale cache
    const data = await res.json();
    cachedRates = { base: data.base, rates: data.rates, timestamp: Date.now() };
    return cachedRates;
  } catch {
    return cachedRates;
  }
}

async function getCryptoRate(): Promise<{ usdtXaf: number; timestamp: number } | null> {
  if (cachedCrypto && Date.now() - cachedCrypto.timestamp < CRYPTO_CACHE_TTL) {
    return cachedCrypto;
  }
  try {
    const res = await fetch(COINGECKO_API, { cache: "no-store" });
    if (!res.ok) return cachedCrypto;
    const data = await res.json();
    // USDT price in USD (should be ~1.00)
    const usdtUsd = data?.tether?.usd || 1;
    // Get fiat USD/XAF rate
    const fiatRates = await getRates();
    const usdXaf = fiatRates?.rates?.["USD"] ? EUR_XAF / fiatRates.rates["USD"] : 655.957 / 1.08;
    // USDT/XAF = USDT/USD × USD/XAF
    const usdtXaf = Math.round(usdtUsd * usdXaf * 100) / 100;
    cachedCrypto = { usdtXaf, timestamp: Date.now() };
    return cachedCrypto;
  } catch {
    return cachedCrypto;
  }
}
