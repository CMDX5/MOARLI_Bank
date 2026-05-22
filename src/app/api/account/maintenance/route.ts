import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * POST /api/account/maintenance
 *
 * Checks if the current month's account maintenance fee (1000 FCFA) has been
 * charged for the authenticated user. The fee is deducted monthly, starting
 * from the user's registration date (createdAt).
 *
 * Logic:
 * 1. Look up user's createdAt to determine billing anniversary
 * 2. Calculate how many full months have elapsed since registration
 * 3. Count how many maintenance fees have already been recorded
 * 4. If behind, charge the difference (up to 3 months max to prevent surprise large deductions)
 * 5. Each charge: debit balance, create transaction record, track revenue
 *
 * Returns: { charged: boolean, amount: number, monthsCharged: number, nextDueDate: string }
 */

const MAINTENANCE_FEE = 1000; // FCFA par mois
const MAX_MONTHS_CHARGE = 3;  // Ne pas facturer plus de 3 mois d'un coup

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rl = await rateLimit(auth.uid, "account:maintenance", { maxRequests: 5, windowSec: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    // 1. Get user profile
    const userDoc = await adminDb.collection("moraliUsers").doc(auth.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const userBalance = Number(userData.balance) || 0;
    const userName = userData.fullName || userData.name || "Utilisateur";

    // Skip admin accounts
    if (userData.role === "admin") {
      return NextResponse.json({ charged: false, reason: "admin_exempt" });
    }

    // Skip suspended accounts
    if (userData.accountStatus === "suspended") {
      return NextResponse.json({ charged: false, reason: "account_suspended" });
    }

    // 2. Determine createdAt
    const createdAtRaw = userData.createdAt;
    let createdAt: Date;
    if (!createdAtRaw) {
      // No createdAt — use updatedAt or current date
      const updatedAtRaw = userData.updatedAt;
      if (updatedAtRaw) {
        createdAt = new Date(
          typeof updatedAtRaw === "object" && "seconds" in updatedAtRaw
            ? (updatedAtRaw as { seconds: number }).seconds * 1000
            : String(updatedAtRaw)
        );
      } else {
        createdAt = new Date();
      }
    } else {
      createdAt = new Date(
        typeof createdAtRaw === "object" && "seconds" in createdAtRaw
          ? (createdAtRaw as { seconds: number }).seconds * 1000
          : String(createdAtRaw)
      );
    }

    // Validate createdAt is a real date
    if (isNaN(createdAt.getTime())) {
      return NextResponse.json({ charged: false, reason: "invalid_createdAt" });
    }

    // 3. Calculate billing months elapsed
    const now = new Date();
    const monthsElapsed = getMonthsBetween(createdAt, now);

    // If less than 1 month since registration, no fee yet
    if (monthsElapsed < 1) {
      const nextDue = getNextDueDate(createdAt, now);
      return NextResponse.json({
        charged: false,
        reason: "first_month_not_complete",
        monthsCharged: 0,
        nextDueDate: nextDue,
      });
    }

    // 4. Count existing maintenance fees for this user
    const existingFees = await adminDb
      .collection("bankRevenue")
      .where("type", "==", "account_maintenance")
      .where("sourceUid", "==", auth.uid)
      .get();

    const feesCharged = existingFees.size;
    const monthsToCharge = Math.min(monthsElapsed - feesCharged, MAX_MONTHS_CHARGE);

    // Already up to date
    if (monthsToCharge <= 0) {
      const nextDue = getNextDueDate(createdAt, now);
      return NextResponse.json({
        charged: false,
        reason: "up_to_date",
        monthsCharged: 0,
        totalFeesPaid: feesCharged,
        nextDueDate: nextDue,
      });
    }

    // 5. Calculate total amount to charge
    const totalCharge = monthsToCharge * MAINTENANCE_FEE;

    // Check if user has enough balance (but allow negative balance for maintenance)
    // We'll charge even if balance is low, as this is a mandatory fee
    const newBalance = userBalance - totalCharge;

    // 6. Execute the charge atomically
    const userRef = adminDb.collection("moraliUsers").doc(auth.uid);

    await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const currentBal = Number(userSnap.data()?.balance) || 0;
      tx.update(userRef, { balance: currentBal - totalCharge, updatedAt: new Date() });
    });

    // 7. Create revenue entries (one per month for transparency)
    for (let i = 0; i < monthsToCharge; i++) {
      const feeDate = new Date(createdAt);
      feeDate.setMonth(feeDate.getMonth() + feesCharged + i + 1);
      feeDate.setDate(1); // First of the month

      const monthLabel = feeDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

      await adminDb.collection("bankRevenue").add({
        type: "account_maintenance",
        amount: MAINTENANCE_FEE,
        sourceUid: auth.uid,
        sourceName: userName,
        referenceId: `MAINT-${Date.now()}-${i}`,
        description: `Frais d'entretien compte — ${monthLabel}`,
        currency: "FCFA",
        createdAt: new Date(),
      });
    }

    // 8. Create a transaction record for the maintenance charge
    const receiptId = `MAINT-${Date.now()}`;
    await adminDb.collection("transactions").add({
      senderUid: auth.uid,
      senderMoraliId: userData.moraliId || "",
      senderName: userName,
      recipientUid: "system",
      recipientMoraliId: "system",
      recipientName: "Morali Pay — Entretien",
      amount: totalCharge,
      fees: 0,
      type: "retrait",
      destination: "maintenance",
      status: "success",
      receiptId,
      createdAt: new Date(),
    });

    // 9. Notify user about the maintenance charge
    try {
      const monthsLabel = monthsToCharge === 1 ? "1 mois" : `${monthsToCharge} mois`;
      await adminDb.collection("users").doc(auth.uid).collection("notifications").add({
        title: `Frais d'entretien — ${totalCharge.toLocaleString("fr-FR")} FCFA (${monthsLabel})`,
        time: new Date().toLocaleString("fr-FR", { timeZone: "Africa/Brazzaville" }),
        badge: "Frais",
        badgeClass: "nb-gold",
        icon: "receipt",
        bg: "rgba(245,158,11,0.12)",
        read: false,
        createdAt: new Date(),
      });
    } catch { /* notification best-effort */ }

    const nextDue = getNextDueDate(createdAt, now);

    return NextResponse.json({
      charged: true,
      amount: totalCharge,
      monthsCharged: monthsToCharge,
      totalFeesPaid: feesCharged + monthsToCharge,
      nextDueDate: nextDue,
    });
  } catch (err) {
    console.error("[account:maintenance] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

/**
 * Calculate the number of complete months between two dates.
 * A month is "complete" when the current date's day >= registration date's day.
 */
function getMonthsBetween(start: Date, end: Date): number {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  const startDay = start.getDate();
  const endDay = end.getDate();

  // If we haven't reached the anniversary day this month, don't count this month
  if (endDay < startDay) {
    months -= 1;
  }

  return Math.max(0, months);
}

/**
 * Calculate the next due date for maintenance fee.
 */
function getNextDueDate(start: Date, now: Date): string {
  const startDay = start.getDate();
  let nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, startDay);

  // Handle edge case where start day > days in next month (e.g., Feb 31)
  if (nextMonth.getDate() !== startDay) {
    nextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Last day of next month
  }

  return nextMonth.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
