import { describe, it, expect, vi, beforeEach } from "vitest";
import { rateLimitByIp, getClientId } from "../rate-limit";

describe("rateLimitByIp", () => {
  beforeEach(() => {
    // Memory store is module-scoped, but we can use unique identifiers
    // to avoid test pollution
  });

  it("allows the first request", () => {
    const result = rateLimitByIp(`test:${Date.now()}:first`, {
      maxRequests: 5,
      windowSec: 60,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("allows requests up to maxRequests", () => {
    const id = `test:${Date.now()}:up-to-max`;
    const max = 5;

    for (let i = 0; i < max; i++) {
      const result = rateLimitByIp(id, { maxRequests: max, windowSec: 60 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(max - i - 1);
    }
  });

  it("blocks request when maxRequests is exceeded", () => {
    const id = `test:${Date.now()}:exceed`;
    const max = 3;

    for (let i = 0; i < max; i++) {
      rateLimitByIp(id, { maxRequests: max, windowSec: 60 });
    }

    const blocked = rateLimitByIp(id, { maxRequests: max, windowSec: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("different identifiers have independent counters", () => {
    const idA = `test:${Date.now()}:user-a`;
    const idB = `test:${Date.now()}:user-b`;
    const max = 2;

    rateLimitByIp(idA, { maxRequests: max, windowSec: 60 });
    rateLimitByIp(idA, { maxRequests: max, windowSec: 60 });

    // A should be blocked
    expect(rateLimitByIp(idA, { maxRequests: max, windowSec: 60 }).allowed).toBe(false);

    // B should still be allowed (has independent counter)
    expect(rateLimitByIp(idB, { maxRequests: max, windowSec: 60 }).allowed).toBe(true);
  });

  it("uses default maxRequests (30) and windowSec (60) when not specified", () => {
    const id = `test:${Date.now()}:defaults`;
    const result = rateLimitByIp(id);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(29);
  });

  it("returns valid resetAt timestamp in the future", () => {
    const id = `test:${Date.now()}:reset-at`;
    const result = rateLimitByIp(id, { maxRequests: 10, windowSec: 60 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 61_000);
  });
});

describe("getClientId", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1" },
    });
    expect(getClientId(req)).toContain("192.168.1.1");
  });

  it("returns IP:userAgent hash format", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "user-agent": "Mozilla/5.0",
      },
    });
    const clientId = getClientId(req);
    expect(clientId).toContain("1.2.3.4");
    expect(clientId.length).toBeGreaterThan(10);
  });

  it("handles missing headers gracefully", () => {
    const req = new Request("http://localhost");
    const clientId = getClientId(req);
    expect(clientId).toContain("unknown");
  });
});
