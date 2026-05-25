import { describe, it, expect } from "vitest";
import {
  sanitizeInput,
  sanitizeAmount,
  formatCurrency,
  formatAmount,
  timeAgo,
  getStrength,
  maskCardNumber,
  generateCardNumber,
  generateMoraliIdentity,
  buildMoraliUser,
} from "../helpers";

describe("sanitizeInput", () => {
  it("removes HTML tags", () => {
    expect(sanitizeInput("<script>alert('xss')</script>")).toBe("alert(xss)");
  });

  it("removes HTML entities", () => {
    expect(sanitizeInput("hello &amp; world")).toBe("hello  world");
  });

  it("removes quotes and backslashes", () => {
    expect(sanitizeInput(`it's a "test\\"`)).toBe("its a test");
  });

  it("trims whitespace", () => {
    expect(sanitizeInput("  hello  ")).toBe("hello");
  });

  it("respects max length", () => {
    expect(sanitizeInput("abcdefghij", 5)).toBe("abcde");
  });

  it("handles null/undefined", () => {
    expect(sanitizeInput(null as any)).toBe("");
    expect(sanitizeInput(undefined as any)).toBe("");
  });
});

describe("sanitizeAmount", () => {
  it("parses numeric strings", () => {
    expect(sanitizeAmount("50000")).toBe(50000);
  });

  it("returns 0 for non-numeric", () => {
    expect(sanitizeAmount("abc")).toBe(0);
  });

  it("strips minus sign and returns absolute", () => {
    expect(sanitizeAmount("-100")).toBe(100);
  });

  it("strips non-numeric chars", () => {
    expect(sanitizeAmount("5,000 FCFA")).toBe(5000);
  });
});

describe("formatCurrency", () => {
  it("formats with French locale", () => {
    const result = formatCurrency(5000);
    expect(result).toContain("5");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("0");
  });

  it("uses absolute value", () => {
    expect(formatCurrency(-5000)).toBe(formatCurrency(5000));
  });
});

describe("formatAmount", () => {
  it("formats credit with + sign", () => {
    expect(formatAmount(5000, "credit")).toMatch(/^\+/);
  });

  it("formats debit with - sign", () => {
    expect(formatAmount(5000, "debit")).toMatch(/^-/);
  });
});

describe("timeAgo", () => {
  it("returns instant for very recent timestamps", () => {
    expect(timeAgo(Date.now() - 5000)).toBe("À l'instant");
  });

  it("returns seconds", () => {
    expect(timeAgo(Date.now() - 30000)).toContain("s");
  });

  it("returns minutes", () => {
    expect(timeAgo(Date.now() - 120000)).toContain("min");
  });

  it("returns hours", () => {
    expect(timeAgo(Date.now() - 7200000)).toContain("h");
  });

  it("returns Hier for 1 day", () => {
    expect(timeAgo(Date.now() - 86400000)).toBe("Hier");
  });
});

describe("getStrength", () => {
  it("returns empty for empty password", () => {
    const result = getStrength("");
    expect(result.label).toBe("");
    expect(result.score).toBe(0);
  });

  it("returns weak for short password", () => {
    const result = getStrength("abc");
    expect(result.label).toBe("Faible");
    expect(result.cls).toBe("w");
  });

  it("returns medium for 8 chars", () => {
    const result = getStrength("abcdefgh");
    expect(result.label).toBe("Faible"); // score 1 (length>=8 only)
  });

  it("returns strong with uppercase, number, and 8+ chars", () => {
    const result = getStrength("Abcdefgh1");
    expect(result.label).toBe("Fort"); // score 3: length, uppercase, digit
    expect(result.cls).toBe("s");
  });

  it("returns very strong with special char", () => {
    const result = getStrength("Abcdefgh1!");
    expect(result.label).toBe("Très fort"); // score 4
    expect(result.cls).toBe("s");
  });
});

describe("maskCardNumber", () => {
  it("masks 4-block card number", () => {
    expect(maskCardNumber("1234 5678 9012 3456")).toBe("1234 •••• •••• 3456");
  });

  it("returns as-is for non-standard format", () => {
    expect(maskCardNumber("1234567890")).toBe("1234567890");
  });
});

describe("generateCardNumber", () => {
  it("generates 4 blocks of 4 digits", () => {
    const num = generateCardNumber();
    expect(num).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
  });
});

describe("generateMoraliIdentity", () => {
  it("generates MORALI ID with 5 digits", () => {
    const result = generateMoraliIdentity("test@example.com");
    expect(result.id).toMatch(/^MORALI\d{5}$/);
  });

  it("generates RIB with correct prefix", () => {
    const result = generateMoraliIdentity("test@example.com");
    expect(result.rib).toMatch(/^MOKG-242-2028-\d{4}$/);
  });

  it("is deterministic with same seed", () => {
    const a = generateMoraliIdentity("test@example.com");
    const b = generateMoraliIdentity("test@example.com");
    expect(a.id).toBe(b.id);
  });

  it("produces different IDs for different seeds", () => {
    const a = generateMoraliIdentity("aaaa");
    const b = generateMoraliIdentity("zzzz");
    expect(a.id).not.toBe(b.id);
  });
});

describe("buildMoraliUser", () => {
  it("builds user from directory data", () => {
    const user = buildMoraliUser({
      uid: "abc123",
      fullName: "John Doe",
      pseudo: "johndoe",
      moraliId: "MORALI12345",
    });
    expect(user.name).toBe("John Doe");
    expect(user.pseudo).toBe("@johndoe");
    expect(user.account).toBe("MORALI12345");
    expect(user.uid).toBe("abc123");
  });

  it("adds @ prefix to pseudo if missing", () => {
    const user = buildMoraliUser({ uid: "abc", pseudo: "test" });
    expect(user.pseudo).toBe("@test");
  });

  it("handles missing fields with defaults", () => {
    const user = buildMoraliUser({ uid: "abc" });
    expect(user.name).toBe("Utilisateur");
    expect(user.account).toBe("MORALI00000");
  });
});
