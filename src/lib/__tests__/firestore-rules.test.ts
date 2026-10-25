import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("firestore.rules", () => {
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

  it("denies client writes on moraliUsers", () => {
    const start = rules.indexOf("match /databases/{db}/documents/moraliUsers/{userId}");
    const end = rules.indexOf("match /databases/{db}/documents/transactions/{txId}");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(rules.slice(start, end)).toMatch(/allow write:\s*if false/);
  });

  it("denies client access to cinetpayPayments", () => {
    expect(rules).toMatch(/match \/databases\/\{db\}\/documents\/cinetpayPayments\/\{paymentId\}/);
    expect(rules).toMatch(/cinetpayPayments\/\{paymentId\} \{\s*allow read, write: if false;/);
  });

  it("denies client writes on transactions", () => {
    const start = rules.indexOf("match /databases/{db}/documents/transactions/{txId}");
    const end = rules.indexOf("match /databases/{db}/documents/serverTransactions/{txId}");
    expect(rules.slice(start, end)).toMatch(/allow create, update, delete:\s*if false/);
  });
});
