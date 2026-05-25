/**
 * Centralized audit logging for user actions.
 *
 * SECURITY: Every sensitive user action (transfer, PIN change, login, etc.)
 * is recorded in the `userAuditLog` Firestore collection.
 * These logs are immutable (never updated/deleted by users) and serve as
 * an audit trail for compliance, fraud investigation, and dispute resolution.
 *
 * Usage in API routes:
 *   import { auditLog } from "@/lib/audit-log";
 *   await auditLog({ uid, action: "transfer:send", details: { amount: 5000, recipientUid: "..." } });
 */

type AuditEvent = {
  /** User UID performing the action */
  uid: string;
  /** Action identifier (e.g. "transfer:send", "pin:create", "login:success") */
  action: string;
  /** Human-readable description */
  description?: string;
  /** Structured metadata (amounts, IDs, etc.) */
  details?: Record<string, unknown>;
  /** IP address of the request */
  ip?: string;
  /** Additional tags for filtering */
  tags?: string[];
  /** Severity level */
  level?: "info" | "warning" | "critical";
};

/**
 * Write an audit log entry to Firestore.
 * Fire-and-forget: errors are logged but don't block the caller.
 */
export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    const { getAdminFirestore } = await import("@/lib/admin-firestore");
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      console.warn("[auditLog] Admin Firestore not available, skipping log");
      return;
    }

    await adminDb.collection("userAuditLog").add({
      uid: event.uid,
      action: event.action,
      description: event.description || event.action,
      details: event.details || {},
      ip: event.ip || null,
      tags: event.tags || [],
      level: event.level || "info",
      createdAt: new Date().toISOString(),
      // ISO timestamp for easier querying
      _ts: Date.now(),
    });
  } catch (err) {
    // Audit logging should NEVER break the main flow
    console.error("[auditLog] Failed to write audit log:", err);
  }
}

/**
 * Pre-defined action constants for type safety and consistency.
 */
export const AUDIT_ACTIONS = {
  // Auth
  LOGIN_SUCCESS: "login:success",
  LOGIN_FAILED: "login:failed",
  LOGOUT: "logout:success",
  REGISTER: "register:complete",
  PASSWORD_RESET: "password:reset",

  // Transfers
  TRANSFER_SEND: "transfer:send",
  TRANSFER_RECEIVE: "transfer:receive",
  TRANSFER_FAILED: "transfer:failed",
  TRANSACTION_CREATE: "transaction:create",

  // PIN
  PIN_CREATE: "pin:create",
  PIN_VERIFY_SUCCESS: "pin:verify:success",
  PIN_VERIFY_FAILED: "pin:verify:failed",
  PIN_RESET: "pin:reset",
  PIN_REVEAL: "pin:reveal",

  // Profile
  PROFILE_UPDATE: "profile:update",
  KYC_SUBMIT: "kyc:submit",

  // Cards
  CARD_CREATE: "card:create",
  CARD_FREEZE: "card:freeze",
  CARD_UNFREEZE: "card:unfreeze",

  // Account
  ACCOUNT_DELETE_REQUESTED: "account:delete:requested",
  ACCOUNT_DELETED: "account:deleted",

  // Security
  RATE_LIMITED: "security:rate_limited",
  SUSPICIOUS_ACTIVITY: "security:suspicious",
} as const;

/**
 * Get the client IP from a NextRequest object.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
