import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the admin-firestore module before importing audit-log
const mockAdd = vi.fn().mockResolvedValue({ id: "test-log-id" });
const mockCollection = vi.fn().mockReturnValue({ add: mockAdd });
vi.mock("@/lib/admin-firestore", () => ({
  getAdminFirestore: vi.fn().mockResolvedValue({
    collection: mockCollection,
  }),
}));

import { auditLog, AUDIT_ACTIONS, getClientIp } from "../audit-log";

describe("auditLog", () => {
  beforeEach(() => {
    mockAdd.mockClear();
    mockCollection.mockClear();
  });

  it("calls Firestore collection('userAuditLog').add with correct structure", async () => {
    await auditLog({
      uid: "user-123",
      action: "transfer:send",
      details: { amount: 5000 },
    });

    expect(mockCollection).toHaveBeenCalledWith("userAuditLog");
    expect(mockAdd).toHaveBeenCalledTimes(1);

    const callArg = mockAdd.mock.calls[0][0];
    expect(callArg.uid).toBe("user-123");
    expect(callArg.action).toBe("transfer:send");
    expect(callArg.details).toEqual({ amount: 5000 });
    expect(callArg.createdAt).toBeDefined();
    expect(callArg._ts).toBeDefined();
    expect(typeof callArg._ts).toBe("number");
  });

  it("includes default values for optional fields", async () => {
    await auditLog({ uid: "u1", action: "test" });

    const callArg = mockAdd.mock.calls[0][0];
    expect(callArg.description).toBe("test");
    expect(callArg.details).toEqual({});
    expect(callArg.ip).toBeNull();
    expect(callArg.tags).toEqual([]);
    expect(callArg.level).toBe("info");
  });

  it("includes IP and custom fields when provided", async () => {
    await auditLog({
      uid: "u1",
      action: "pin:create",
      ip: "192.168.1.1",
      tags: ["security", "pin"],
      level: "warning",
    });

    const callArg = mockAdd.mock.calls[0][0];
    expect(callArg.ip).toBe("192.168.1.1");
    expect(callArg.tags).toEqual(["security", "pin"]);
    expect(callArg.level).toBe("warning");
  });

  it("does not throw when Firestore is unavailable", async () => {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    (getAdminFirestore as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    // Should not throw
    await expect(auditLog({ uid: "u1", action: "test" })).resolves.toBeUndefined();
  });

  it("does not throw when Firestore add fails", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Firestore unavailable"));

    // Should not throw (fire-and-forget)
    await expect(auditLog({ uid: "u1", action: "test" })).resolves.toBeUndefined();
  });
});

describe("AUDIT_ACTIONS", () => {
  it("contains auth actions", () => {
    expect(AUDIT_ACTIONS.LOGIN_SUCCESS).toBe("login:success");
    expect(AUDIT_ACTIONS.LOGIN_FAILED).toBe("login:failed");
    expect(AUDIT_ACTIONS.LOGOUT).toBe("logout:success");
    expect(AUDIT_ACTIONS.REGISTER).toBe("register:complete");
  });

  it("contains transfer actions", () => {
    expect(AUDIT_ACTIONS.TRANSFER_SEND).toBe("transfer:send");
    expect(AUDIT_ACTIONS.TRANSFER_RECEIVE).toBe("transfer:receive");
    expect(AUDIT_ACTIONS.TRANSFER_FAILED).toBe("transfer:failed");
  });

  it("contains PIN actions", () => {
    expect(AUDIT_ACTIONS.PIN_CREATE).toBe("pin:create");
    expect(AUDIT_ACTIONS.PIN_VERIFY_SUCCESS).toBe("pin:verify:success");
    expect(AUDIT_ACTIONS.PIN_VERIFY_FAILED).toBe("pin:verify:failed");
    expect(AUDIT_ACTIONS.PIN_RESET).toBe("pin:reset");
  });

  it("contains security actions", () => {
    expect(AUDIT_ACTIONS.RATE_LIMITED).toBe("security:rate_limited");
    expect(AUDIT_ACTIONS.SUSPICIOUS_ACTIVITY).toBe("security:suspicious");
  });

  it("contains account deletion actions", () => {
    expect(AUDIT_ACTIONS.ACCOUNT_DELETE_REQUESTED).toBe("account:delete:requested");
    expect(AUDIT_ACTIONS.ACCOUNT_DELETED).toBe("account:deleted");
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("returns unknown when no IP headers", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("unknown");
  });
});
