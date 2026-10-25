import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  CINETPAY_HMAC_FIELDS,
  computeCinetpayToken,
  decideSettlement,
  isValidTransactionId,
  normalizeCongoPhone,
  parseCheckResponse,
  parseCinetpayBody,
  resolveAppBaseUrl,
  validateDepositAmount,
  verifyCinetpayToken,
  type CinetPayCheck,
} from "../cinetpay";

const notifyFields: Record<string, string> = {
  cpm_site_id: "123",
  cpm_trans_id: "mpabc12345",
  cpm_trans_date: "2026-01-01 00:00:00",
  cpm_amount: "1000",
  cpm_currency: "XAF",
  signature: "sig",
  payment_method: "OM",
  cel_phone_num: "060000000",
  cpm_phone_prefixe: "242",
  cpm_language: "fr",
  cpm_version: "V4",
  cpm_payment_config: "SINGLE",
  cpm_page_action: "PAYMENT",
  cpm_custom: "uid1",
  cpm_designation: "Depot",
  cpm_error_message: "",
};

function specToken(fields: Record<string, string>, secret: string): string {
  const data = CINETPAY_HMAC_FIELDS.map((key) => fields[key] ?? "").join("");
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

const accepted = (over: Partial<CinetPayCheck> = {}): CinetPayCheck => ({
  code: "00",
  status: "ACCEPTED",
  amount: 1000,
  currency: "XAF",
  ...over,
});

describe("CinetPay deposit rules", () => {
  it("accepts a Congo mobile amount that CinetPay can charge", () => {
    expect(validateDepositAmount(1000)).toBeNull();
    expect(validateDepositAmount(100)).toBeNull();
    expect(validateDepositAmount(105)).toBeNull();
  });

  it("rejects amounts that are not a positive multiple of 5", () => {
    expect(validateDepositAmount(103)).toMatch(/multiple de 5/);
    expect(validateDepositAmount(0)).toBeTruthy();
    expect(validateDepositAmount(50)).toBeTruthy();
    expect(validateDepositAmount(5_000_005)).toBeTruthy();
    expect(validateDepositAmount(1000.5)).toBeTruthy();
  });

  it("keeps the local 05/06 number", () => {
    expect(normalizeCongoPhone("06 12 34 56 7")).toBe("061234567");
    expect(normalizeCongoPhone("+242051234567")).toBe("051234567");
    expect(normalizeCongoPhone("071234567")).toBeNull();
  });
});

describe("CinetPay x-token", () => {
  it("matches the documented HMAC concatenation", () => {
    const secret = "test-secret";
    expect(computeCinetpayToken(notifyFields, secret)).toBe(specToken(notifyFields, secret));
    expect(verifyCinetpayToken(notifyFields, secret, specToken(notifyFields, secret))).toBe(true);
  });

  it("rejects a missing, tampered, or differently sized token", () => {
    const secret = "test-secret";
    const token = specToken(notifyFields, secret);
    expect(verifyCinetpayToken(notifyFields, secret, null)).toBe(false);
    expect(verifyCinetpayToken(notifyFields, secret, token.slice(0, -1))).toBe(false);
    expect(verifyCinetpayToken({ ...notifyFields, cpm_amount: "5" }, secret, token)).toBe(false);
    expect(verifyCinetpayToken(notifyFields, "", token)).toBe(false);
  });

  it("treats a missing notify field as an empty string", () => {
    const partial = { ...notifyFields };
    delete partial.cpm_error_message;
    expect(computeCinetpayToken(partial, "k")).toBe(computeCinetpayToken({ ...partial, cpm_error_message: "" }, "k"));
  });

  it("parses the form body CinetPay posts", () => {
    const raw = "cpm_trans_id=mpabc12345&cpm_site_id=123&cpm_amount=1000";
    expect(parseCinetpayBody(raw, "application/x-www-form-urlencoded").cpm_trans_id).toBe("mpabc12345");
    expect(parseCinetpayBody('{"cpm_trans_id":"mpabc12345"}', "application/json").cpm_trans_id).toBe("mpabc12345");
  });
});

describe("CinetPay settlement", () => {
  const base = { alreadyCredited: false, storedAmount: 1000, storedCurrency: "XAF" };

  it("credits only an accepted check for the stored amount", () => {
    expect(decideSettlement({ ...base, check: accepted() })).toBe("credit");
    expect(decideSettlement({ ...base, check: parseCheckResponse({
      code: "00",
      data: { amount: "1000", currency: "XAF", status: "ACCEPTED" },
    })! })).toBe("credit");
  });

  it("never credits twice", () => {
    expect(decideSettlement({ ...base, alreadyCredited: true, check: accepted() })).toBe("duplicate");
  });

  it("does not credit a different amount, currency, or an unfinished payment", () => {
    expect(decideSettlement({ ...base, check: accepted({ amount: 500 }) })).toBe("mismatch");
    expect(decideSettlement({ ...base, check: accepted({ currency: "XOF" }) })).toBe("mismatch");
    expect(decideSettlement({ ...base, check: accepted({ code: "201" }) })).toBe("pending");
    expect(decideSettlement({
      ...base,
      check: accepted({ code: "00", status: "WAITING_FOR_CUSTOMER" }),
    })).toBe("pending");
  });

  it("marks a refused check without crediting", () => {
    expect(decideSettlement({
      ...base,
      check: accepted({ code: "627", status: "REFUSED", amount: 1000 }),
    })).toBe("refused");
  });

  it("reads the check payload CinetPay returns", () => {
    expect(parseCheckResponse({
      code: "627",
      message: "TRANSACTION_CANCEL",
      data: { amount: "100", currency: "XAF", status: "REFUSED" },
    })).toEqual({ code: "627", status: "REFUSED", amount: 100, currency: "XAF" });
    expect(parseCheckResponse(null)).toBeNull();
  });
});

describe("CinetPay app URL", () => {
  it("prefers APP_BASE_URL and rejects unsafe origins", () => {
    const previous = process.env.APP_BASE_URL;
    const vercel = process.env.VERCEL_URL;
    process.env.APP_BASE_URL = "https://bank.example";
    delete process.env.VERCEL_URL;
    expect(resolveAppBaseUrl("https://preview.example")).toBe("https://bank.example");
    process.env.APP_BASE_URL = "javascript:alert(1)";
    process.env.VERCEL_URL = "morali.vercel.app";
    expect(resolveAppBaseUrl()).toBe("https://morali.vercel.app");
    if (previous === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = previous;
    if (vercel === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = vercel;
  });

  it("accepts the transaction ids this server generates", () => {
    expect(isValidTransactionId("mp0123456789abcdef0123")).toBe(true);
    expect(isValidTransactionId("short")).toBe(false);
    expect(isValidTransactionId("has space")).toBe(false);
    expect(isValidTransactionId("../etc")).toBe(false);
  });
});
