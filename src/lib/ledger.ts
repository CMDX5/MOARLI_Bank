/**
 * Single server-side writer for user balances.
 * Client SDK writes to moraliUsers are denied by firestore.rules.
 */

export const MOMO_WITHDRAWAL_FEE_RATE = 0.02;
export const SERVICE_FEE_RATE = 0.02;
export const EXCHANGE_FEE_RATE = 0.015;
export const EUR_XAF_PEG = 655.957;
export const MAX_CASH_MOVEMENT = 5_000_000;
export const DEFAULT_FX_RATES: Record<"EUR" | "USD", number> = {
  EUR: 1 / EUR_XAF_PEG,
  USD: 0.0016,
};

export function serverWithdrawalFee(
  amount: number,
  channel: "momo" | "service",
  applyFee: boolean,
): number {
  const principal = Math.round(amount);
  if (principal <= 0) return 0;
  if (channel === "momo") return Math.floor(principal * MOMO_WITHDRAWAL_FEE_RATE);
  if (applyFee) return Math.floor(principal * SERVICE_FEE_RATE);
  return 0;
}

/**
 * Accept a client-displayed rate only when it stays within 2% of the server rate.
 * Stops a caller from booking an arbitrary FX price.
 */
export function acceptQuotedRate(serverRate: number, quoted?: number): number {
  if (!Number.isFinite(serverRate) || serverRate <= 0) {
    throw new Error("RATE_UNAVAILABLE");
  }
  if (quoted === undefined || quoted === null || !Number.isFinite(quoted) || quoted <= 0) {
    return serverRate;
  }
  const drift = Math.abs(quoted - serverRate) / serverRate;
  if (drift <= 0.02) return quoted;
  return serverRate;
}

export function quoteExchange(input: {
  direction: "sell" | "buy";
  currency: "EUR" | "USD";
  amount: number;
  rate: number;
}): { feeXaf: number; converted: number; debit: number } {
  const amount = input.direction === "sell" ? Math.round(input.amount) : Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");
  if (!Number.isFinite(input.rate) || input.rate <= 0) throw new Error("RATE_UNAVAILABLE");

  if (input.direction === "sell") {
    const feeXaf = Math.round(amount * EXCHANGE_FEE_RATE);
    const netXaf = amount - feeXaf;
    const converted = netXaf * input.rate;
    if (!(converted > 0)) throw new Error("INVALID_AMOUNT");
    return { feeXaf, converted, debit: amount };
  }

  const feeCurrency = amount * EXCHANGE_FEE_RATE;
  const netCurrency = amount - feeCurrency;
  const converted = Math.round(netCurrency / input.rate);
  const feeXaf = Math.round(feeCurrency / input.rate);
  if (converted <= 0) throw new Error("INVALID_AMOUNT");
  return { feeXaf, converted, debit: amount };
}
