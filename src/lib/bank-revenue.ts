/**
 * MORALI Bank — Revenue Tracking System
 *
 * Tracks all bank revenue sources:
 * - Withdrawal fees (2%)
 * - Service payment fees (2%)
 * - Currency exchange commissions (1.5%)
 * - Account maintenance fees (1,000 FCFA/month)
 * - Tontine commissions
 * - Micro-credit interest
 * - Black card annual fees
 *
 * All revenue entries are written to Firestore `bankRevenue` collection
 * via Admin SDK (from API routes) or directly (from server-side code).
 */

import { getAdminFirestore } from "@/lib/admin-firestore";

// ── Revenue Types ──
export type RevenueType =
  | "withdrawal_fee"      // 2% on withdrawals
  | "service_fee"          // 2% on service payments
  | "exchange_fee"         // 1.5% on currency exchange
  | "account_maintenance"  // 1,000 FCFA monthly
  | "transfer_fee"         // Fee on transfers
  | "tontine_commission"   // Commission on tontines
  | "microcredit_interest" // Interest on loans
  | "black_card_fee"       // Annual Black card fee
  | "savings_interest_diff"// Savings interest diff
  | "other";               // Miscellaneous

// ── Revenue Entry Interface ──
export interface RevenueEntry {
  type: RevenueType;
  amount: number;           // Fee amount in FCFA
  sourceUid: string;        // User who generated the revenue
  sourceName: string;       // User display name
  referenceId?: string;     // Transaction/operation reference
  description: string;      // Human-readable description
  currency?: string;        // "FCFA" by default
  createdAt: Date;
}

// ── Fee Constants ──
export const MORALI_FEES = {
  /** Withdrawal fee rate (same as MTN Congo) */
  WITHDRAWAL_RATE: 0.02,
  /** Service payment fee rate */
  SERVICE_RATE: 0.02,
  /** Currency exchange commission rate */
  EXCHANGE_RATE: 0.015,
  /** Monthly account maintenance fee */
  ACCOUNT_MAINTENANCE: 1000,
  /** Inter-MORALI transfer fee */
  TRANSFER_FEE: 0, // FREE
  /** Tontine commission rate */
  TONTINE_RATE: 0.01,
  /** Micro-credit interest rate (monthly) */
  MICRO_CREDIT_RATE: 0.03,
  /** Personal loan interest rate (monthly) */
  PERSONAL_LOAN_RATE: 0.025,
  /** Black card annual fee */
  BLACK_CARD_ANNUAL: 15000,
} as const;

// ── Label Map for Display ──
export const REVENUE_LABELS: Record<RevenueType, string> = {
  withdrawal_fee: "Frais de retrait (2%)",
  service_fee: "Frais de service (2%)",
  exchange_fee: "Commission de change (1.5%)",
  account_maintenance: "Frais d'entretien compte",
  transfer_fee: "Frais de transfert",
  tontine_commission: "Commission tontine",
  microcredit_interest: "Intérêts micro-crédit",
  black_card_fee: "Frais carte Black",
  savings_interest_diff: "Intérêts épargne",
  other: "Autres revenus",
};

// ── Track Revenue (Admin SDK — server-side only) ──
export async function trackRevenue(entry: RevenueEntry): Promise<boolean> {
  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      console.warn("[bank-revenue] Admin Firestore unavailable — revenue not tracked");
      return false;
    }

    await adminDb.collection("bankRevenue").add({
      type: entry.type,
      amount: Number(entry.amount) || 0,
      sourceUid: String(entry.sourceUid || ""),
      sourceName: String(entry.sourceName || "Utilisateur"),
      referenceId: entry.referenceId ? String(entry.referenceId) : null,
      description: String(entry.description || ""),
      currency: String(entry.currency || "FCFA"),
      createdAt: entry.createdAt || new Date(),
    });

    return true;
  } catch (err) {
    console.error("[bank-revenue] Error tracking revenue:", err);
    return false;
  }
}

// ── Track Revenue via Client Firestore (fallback for client-side operations) ──
export async function trackRevenueClient(db: import("firebase/firestore").Firestore, entry: RevenueEntry): Promise<boolean> {
  try {
    const { collection, addDoc, serverTimestamp } = await import("firebase/firestore");
    await addDoc(collection(db, "bankRevenue"), {
      ...entry,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[bank-revenue] Client tracking error:", err);
    return false;
  }
}

// ── Calculate withdrawal fee ──
export function calcWithdrawalFee(amount: number): number {
  return Math.floor(amount * MORALI_FEES.WITHDRAWAL_RATE);
}

// ── Calculate service fee ──
export function calcServiceFee(amount: number): number {
  return Math.floor(amount * MORALI_FEES.SERVICE_RATE);
}

// ── Calculate exchange fee ──
export function calcExchangeFee(amount: number): number {
  return Math.floor(amount * MORALI_FEES.EXCHANGE_RATE);
}
