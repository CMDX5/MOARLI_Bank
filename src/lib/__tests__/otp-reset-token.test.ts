import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-firestore", () => ({
  getAdminFirestore: vi.fn(async () => null),
}));

import { consumeResetToken, createResetToken } from "../otp-store";

describe("password reset tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a token presented for a different email", async () => {
    const token = await createResetToken("Alice@Example.com");
    expect(await consumeResetToken(token, "bob@example.com")).toBe(false);
  });

  it("accepts the bound email once, ignoring case and spaces", async () => {
    const token = await createResetToken("alice@example.com");
    expect(await consumeResetToken(token, " Alice@Example.com ")).toBe(true);
    expect(await consumeResetToken(token, "alice@example.com")).toBe(false);
  });

  it("rejects an unknown token", async () => {
    expect(await consumeResetToken("rst_does_not_exist", "alice@example.com")).toBe(false);
  });
});
