/**
 * Centralized Zod validation schemas for all API routes.
 *
 * SECURITY: All API routes must use these schemas for input validation.
 * This prevents:
 * - Type coercion attacks (string "0" vs number 0)
 * - Missing required fields
 * - Out-of-bounds values (negative amounts, oversized images)
 * - XSS via unsanitized string fields
 *
 * Usage:
 *   import { validateBody, schemas } from "@/lib/validation";
 *   const result = validateBody(schemas.transactionCreate, body);
 *   if (!result.success) return errorResponse(result.error);
 *   const data = result.data; // fully typed
 */
import { z } from "zod";

// ─── Shared Helpers ───────────────────────────────────────────

/** Firebase UID format: alphanumeric, underscore, hyphen, 1-128 chars */
export const firebaseUid = z.string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/, "Format uid invalide");

/** Sanitized string: HTML entities and dangerous chars removed */
export const sanitizedString = z.string()
  .transform((s) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, "").replace(/['"\\]/g, "").trim());

/** Email format */
export const email = z.string()
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email invalide");

/** 6-digit OTP code */
export const otpCode = z.string()
  .regex(/^\d{6}$/, "Code doit être 6 chiffres");

/** 4-digit PIN code */
export const pinCode = z.string()
  .regex(/^\d{4}$/, "Le PIN doit être exactement 4 chiffres");

/** Morali ID format: MORALI followed by digits */
export const moraliId = z.string()
  .transform((s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().regex(/^MORALI\d{1,20}$/, "Format identifiant Morali invalide"));

/** Transaction amount: positive number, max 50M FCFA */
export const txAmount = z.number()
  .positive("Le montant doit être positif")
  .max(50_000_000, "Montant maximum: 50 000 000 FCFA")
  .or(z.string().transform((s) => Number(s)).pipe(
    z.number().positive().max(50_000_000)
  ));

/** Small amount for direct credits: max 1M FCFA */
export const creditAmount = z.number()
  .positive("Le montant doit être positif")
  .max(1_000_000, "Montant maximum: 1 000 000 FCFA")
  .or(z.string().transform((s) => Number(s)).pipe(
    z.number().positive().max(1_000_000)
  ));

/** Password: min 8 chars, max 128 */
export const password = z.string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .max(128, "Mot de passe trop long");

/** Base64 image: max 5MB raw (~7MB base64) */
export const base64Image = z.string()
  .max(7_000_000, "Image trop volumineuse (max 5 MB)");

// ─── Route Schemas ────────────────────────────────────────────

export const schemas = {
  /** POST /api/transactions/create */
  transactionCreate: z.object({
    receiptId: z.string().min(1, "Reçu requis"),
    senderUid: firebaseUid,
    senderMoraliId: sanitizedString.max(50).optional().default(""),
    senderName: sanitizedString.max(100).optional().default("Utilisateur"),
    recipientUid: firebaseUid,
    recipientMoraliId: sanitizedString.max(50).optional().default(""),
    recipientName: sanitizedString.max(100).optional().default("Utilisateur"),
    amount: txAmount,
    fees: z.number().min(0).optional().default(0),
    type: z.enum(["depot", "retrait", "virement", "remboursement"]).optional().default("virement"),
    status: z.string().max(20).optional().default("success"),
    destination: z.enum(["cash", "airtime", "loan_request", "loan_granted"]).nullable().optional(),
  }),

  /** POST /api/pin/store */
  pinStore: z.object({
    pinHash: z.string().min(1, "Hash PIN requis"),
    salt: z.string().min(1, "Sel requis"),
    encryptedPin: z.string().nullable().optional(),
    pinIv: z.string().nullable().optional(),
  }),

  /** POST /api/pin/reset */
  pinReset: z.object({
    pinHash: z.string().min(1, "Hash PIN requis"),
    salt: z.string().min(1, "Sel requis"),
    encryptedPin: z.string().nullable().optional(),
    pinIv: z.string().nullable().optional(),
  }),

  /** POST /api/verify-pin */
  verifyPin: z.object({
    pin: pinCode,
  }),

  /** POST /api/notifications/create */
  notificationCreate: z.object({
    uid: firebaseUid,
    title: sanitizedString.max(200),
    time: sanitizedString.max(50).optional().default("À l'instant"),
    badge: sanitizedString.max(50).optional().default("Info"),
    badgeClass: sanitizedString.max(50).optional().default("nb-blue"),
    icon: sanitizedString.max(50).optional().default("bell"),
    bg: sanitizedString.max(100).optional().default("rgba(59,130,246,0.12)"),
  }),

  /** POST /api/kyc */
  kycSubmit: z.object({
    documentType: z.enum(["national_id", "passport", "driver_license"], "Type de document invalide"),
    documentFront: base64Image,
    documentBack: base64Image.nullable().optional(),
    selfiePhoto: base64Image.nullable().optional(),
    fullName: sanitizedString.max(100),
    dateOfBirth: z.string().max(20).nullable().optional(),
    documentNumber: sanitizedString.max(50).nullable().optional(),
  }),

  /** GET /api/directory/search — query param "q" */
  directorySearch: z.object({
    q: z.string().min(2).max(100, "Requête trop longue"),
  }),

  /** POST /api/directory/register */
  directoryRegister: z.object({
    uid: firebaseUid,
    moraliId: moraliId,
    pseudo: sanitizedString.max(20).optional().default(""),
    fullName: sanitizedString.max(100).optional().default("Utilisateur"),
    firstName: sanitizedString.max(50).optional(),
    lastName: sanitizedString.max(50).optional(),
  }),

  /** POST /api/directory/pending-credit */
  pendingCreditCreate: z.object({
    recipientUid: firebaseUid,
    amount: txAmount,
    senderName: sanitizedString.max(100).optional().default(""),
    senderMoraliId: sanitizedString.max(50).optional().default(""),
    receiptId: sanitizedString.max(50).optional().default(""),
  }),

  /** DELETE /api/directory/pending-credit */
  pendingCreditDelete: z.object({
    id: firebaseUid,
  }),

  /** PUT /api/directory/pending-credit */
  pendingCreditApply: z.object({
    recipientUid: firebaseUid,
    amount: creditAmount,
    senderName: sanitizedString.max(100).optional().default(""),
    senderMoraliId: sanitizedString.max(50).optional().default(""),
    receiptId: sanitizedString.max(50).optional().default(""),
  }),

  /** POST /api/admin/login */
  adminLogin: z.object({
    email: email,
    password: z.string().min(1, "Mot de passe requis").max(128),
  }),

  /** POST /api/admin/log */
  adminLog: z.object({
    action: z.string().min(1, "Action requise").max(100),
    details: z.string().max(500).optional().default(""),
    confirmToken: z.string().optional(),
  }),

  /** POST /api/admin/reset-all */
  adminResetAll: z.object({
    confirmReset: z.literal("RESET_ALL_DATA", "Confirmation invalide"),
  }),

  /** POST /api/admin/delete-user */
  adminDeleteUser: z.object({
    uid: firebaseUid,
  }),

  /** POST /api/admin/audit-log */
  adminAuditLog: z.object({
    action: z.string().max(100).optional().default(""),
    target: z.string().max(100).optional().default(""),
    details: z.string().max(500).optional().default(""),
  }),

  /** POST /api/sms/verify-otp */
  smsVerifyOtp: z.object({
    phone: z.string().min(1, "Numéro requis"),
    code: otpCode,
  }),

  /** POST /api/email/verify-otp */
  emailVerifyOtp: z.object({
    email: email,
    code: otpCode,
  }),

  /** POST /api/email/send-otp */
  emailSendOtp: z.object({
    email: email,
  }),

  /** POST /api/auth/send-reset-code */
  authSendResetCode: z.object({
    email: email,
  }),

  /** POST /api/auth/verify-reset-code */
  authVerifyResetCode: z.object({
    email: email,
    code: otpCode,
  }),

  /** POST /api/auth/reset-password */
  authResetPassword: z.object({
    email: email,
    newPassword: password,
  }),
};

// ─── Validation Helper ───────────────────────────────────────

export type ValidationResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

/**
 * Validate a body/payload against a Zod schema.
 * Returns typed result or error string.
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data as z.infer<T> };
  }
  // Return first error message in French
  const firstError = result.error.issues[0];
  const message = firstError ? (firstError.message || "Champ invalide") : "Données invalides";
  return { success: false, error: message };
}
