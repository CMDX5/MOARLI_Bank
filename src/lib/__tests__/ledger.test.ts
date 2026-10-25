import { describe, expect, it } from "vitest";
import { acceptQuotedRate, quoteExchange, serverWithdrawalFee } from "../ledger";

describe("ledger helpers", () => {
  it("charges 2% on mobile-money withdrawals and optional service fees", () => {
    expect(serverWithdrawalFee(10_000, "momo", false)).toBe(200);
    expect(serverWithdrawalFee(10_000, "service", true)).toBe(200);
    expect(serverWithdrawalFee(10_000, "service", false)).toBe(0);
    expect(serverWithdrawalFee(0, "momo", true)).toBe(0);
  });

  it("keeps a quoted FX rate only inside 2%", () => {
    expect(acceptQuotedRate(0.00152449, 0.00152)).toBe(0.00152);
    expect(acceptQuotedRate(0.0016, 0.002)).toBe(0.0016);
    expect(acceptQuotedRate(0.0016)).toBe(0.0016);
  });

  it("rejects a missing server rate", () => {
    expect(() => acceptQuotedRate(0, 1)).toThrow("RATE_UNAVAILABLE");
  });

  it("quotes a sell and a buy without zeroing the converted amount", () => {
    const sell = quoteExchange({ direction: "sell", currency: "EUR", amount: 10_000, rate: 0.00152 });
    expect(sell.debit).toBe(10_000);
    expect(sell.feeXaf).toBe(150);
    expect(sell.converted).toBeCloseTo(9850 * 0.00152, 6);

    const buy = quoteExchange({ direction: "buy", currency: "USD", amount: 10, rate: 0.0016 });
    expect(buy.debit).toBe(10);
    expect(buy.converted).toBeGreaterThan(0);
  });
});
