import { describe, it, expect } from "vitest";
import { validateBody, schemas } from "../validation";

describe("validateBody", () => {
  it("returns success with typed data for valid input", () => {
    const result = validateBody(schemas.transactionCreate, {
      receiptId: "rcpt-001",
      senderUid: "user-abc-123",
      recipientUid: "user-xyz-789",
      amount: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.receiptId).toBe("rcpt-001");
      expect(result.data.amount).toBe(5000);
      expect(result.data.type).toBe("virement");
      expect(result.data.status).toBe("success");
    }
  });

  it("returns error string for invalid input", () => {
    const result = validateBody(schemas.transactionCreate, {
      receiptId: "", // min 1 required
      senderUid: "abc",
      recipientUid: "xyz",
      amount: 5000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("schemas.transactionCreate", () => {
  const validBody = {
    receiptId: "rcpt-001",
    senderUid: "user_abc123",
    senderMoraliId: "MORALI12345",
    senderName: "Jean Dupont",
    recipientUid: "user_xyz789",
    recipientMoraliId: "MORALI67890",
    recipientName: "Marie Curie",
    amount: 5000,
    fees: 0,
    type: "virement",
    status: "success",
  };

  it("accepts valid transaction body", () => {
    const result = schemas.transactionCreate.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects missing receiptId", () => {
    const { receiptId, ...missing } = validBody;
    const result = schemas.transactionCreate.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects missing senderUid", () => {
    const { senderUid, ...missing } = validBody;
    const result = schemas.transactionCreate.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects missing recipientUid", () => {
    const { recipientUid, ...missing } = validBody;
    const result = schemas.transactionCreate.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects amount > 5,000,000", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, amount: 6_000_000 });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, amount: -100 });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects string amount that parses to negative", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, amount: "-5000" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid uid format (spaces)", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, senderUid: "user abc 123" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid uid format (special chars)", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, senderUid: "user@abc!" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, type: "invalid_type" });
    expect(result.success).toBe(false);
  });

  it("accepts string amount that parses to valid number", () => {
    const result = schemas.transactionCreate.safeParse({ ...validBody, amount: "5000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(5000);
    }
  });

  it("accepts missing optional fields with defaults", () => {
    const minimal = { receiptId: "r", senderUid: "u1", recipientUid: "u2", amount: 100 };
    const result = schemas.transactionCreate.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("virement");
      expect(result.data.status).toBe("success");
      expect(result.data.fees).toBe(0);
      expect(result.data.senderName).toBe("Utilisateur");
    }
  });
});

describe("schemas.pinStore", () => {
  it("accepts valid 4-digit pin", () => {
    const result = schemas.pinStore.safeParse({ pin: "1234" });
    expect(result.success).toBe(true);
  });

  it("rejects 3-digit pin", () => {
    const result = schemas.pinStore.safeParse({ pin: "123" });
    expect(result.success).toBe(false);
  });

  it("rejects empty pin", () => {
    const result = schemas.pinStore.safeParse({ pin: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric pin", () => {
    const result = schemas.pinStore.safeParse({ pin: "abcd" });
    expect(result.success).toBe(false);
  });

  it("rejects pin with letters", () => {
    const result = schemas.pinStore.safeParse({ pin: "12a4" });
    expect(result.success).toBe(false);
  });
});

describe("schemas.verifyPin", () => {
  it("accepts valid 4-digit pin", () => {
    const result = schemas.verifyPin.safeParse({ pin: "0000" });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric pin", () => {
    const result = schemas.verifyPin.safeParse({ pin: "abcd" });
    expect(result.success).toBe(false);
  });

  it("rejects pin longer than 4 digits", () => {
    const result = schemas.verifyPin.safeParse({ pin: "12345" });
    expect(result.success).toBe(false);
  });
});

describe("schemas.notificationCreate", () => {
  it("accepts valid notification", () => {
    const result = schemas.notificationCreate.safeParse({
      uid: "user_123",
      title: "Test notification",
      time: "À l'instant",
      badge: "Info",
      badgeClass: "nb-blue",
      icon: "bell",
      bg: "rgba(59,130,246,0.12)",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing uid", () => {
    const result = schemas.notificationCreate.safeParse({
      title: "Test notification",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty uid", () => {
    const result = schemas.notificationCreate.safeParse({
      uid: "",
      title: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("schemas.directorySearch", () => {
  it("accepts valid search query", () => {
    const result = schemas.directorySearch.safeParse({ q: "MORALI" });
    expect(result.success).toBe(true);
  });

  it("rejects query too short (< 2 chars)", () => {
    const result = schemas.directorySearch.safeParse({ q: "M" });
    expect(result.success).toBe(false);
  });

  it("rejects query too long (> 100 chars)", () => {
    const result = schemas.directorySearch.safeParse({ q: "A".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("schemas.kycSubmit", () => {
  it("accepts valid KYC submission", () => {
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";
    const result = schemas.kycSubmit.safeParse({
      documentType: "national_id",
      documentFront: base64Image,
      documentBack: null,
      selfiePhoto: null,
      fullName: "Jean Dupont",
      dateOfBirth: "1990-01-15",
      documentNumber: "CD-12345",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid documentType", () => {
    const result = schemas.kycSubmit.safeParse({
      documentType: "passport_expired",
      documentFront: "base64data",
      fullName: "Test",
    });
    expect(result.success).toBe(false);
  });
});

describe("schemas.adminLogin", () => {
  it("accepts valid admin credentials", () => {
    const result = schemas.adminLogin.safeParse({
      email: "admin@morali.bank",
      password: "SecurePass123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = schemas.adminLogin.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = schemas.adminLogin.safeParse({
      email: "admin@morali.bank",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("schemas.pinReset", () => {
  it("accepts valid pin reset", () => {
    const result = schemas.pinReset.safeParse({ pin: "5678" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid pin in reset", () => {
    const result = schemas.pinReset.safeParse({ pin: "56" });
    expect(result.success).toBe(false);
  });
});

describe("schemas.otpCode", () => {
  it("accepts 6-digit OTP from smsVerifyOtp", () => {
    const result = schemas.smsVerifyOtp.safeParse({
      phone: "+242061234567",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects 5-digit OTP", () => {
    const result = schemas.smsVerifyOtp.safeParse({
      phone: "+242061234567",
      code: "12345",
    });
    expect(result.success).toBe(false);
  });
});

describe("validateBody — strip unknown fields (security)", () => {
  it("strips unknown fields from transaction create payload", () => {
    const result = validateBody(schemas.transactionCreate, {
      receiptId: "rcpt-001",
      senderUid: "user-abc-123",
      recipientUid: "user-xyz-789",
      amount: 5000,
      // Injection attempt: extra fields that should be stripped
      isAdmin: true,
      role: "admin",
      balance: 999999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.receiptId).toBe("rcpt-001");
      expect((result.data as Record<string, unknown>).isAdmin).toBeUndefined();
      expect((result.data as Record<string, unknown>).role).toBeUndefined();
      expect((result.data as Record<string, unknown>).balance).toBeUndefined();
    }
  });

  it("strips unknown fields from PIN store payload", () => {
    const result = validateBody(schemas.pinStore, {
      pin: "1234",
      // Injection attempt
      uid: "attacker-uid",
      bypassVerification: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pin).toBe("1234");
      expect((result.data as Record<string, unknown>).uid).toBeUndefined();
      expect((result.data as Record<string, unknown>).bypassVerification).toBeUndefined();
    }
  });

  it("strips unknown fields from admin login payload", () => {
    const result = validateBody(schemas.adminLogin, {
      email: "admin@morali.pay",
      password: "secret123",
      // Injection attempt
      isAdmin: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@morali.pay");
      expect((result.data as Record<string, unknown>).isAdmin).toBeUndefined();
    }
  });

  it("still rejects invalid known fields even with strip mode", () => {
    const result = validateBody(schemas.pinStore, {
      pin: "abcde", // Invalid: not 4 digits
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });
});
