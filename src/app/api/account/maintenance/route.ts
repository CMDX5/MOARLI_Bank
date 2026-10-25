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

    // 4. Seed from existing revenue rows only when the counter document is absent.
    const existingFees = await adminDb
      .collection("bankRevenue")
      .where("type", "==", "account_maintenance")
      .where("sourceUid", "==", auth.uid)
      .get();
    const seededCount = existingFees.size;

    const userRef = adminDb.collection("moraliUsers").doc(auth.uid);
    const counterRef = adminDb.collection("accountMaintenance").doc(auth.uid);

    const charge = await adminDb.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const counterSnap = await tx.get(counterRef);
      const already = counterSnap.exists ? Number(counterSnap.data()?.monthsCharged) || 0 : seededCount;
      const due = Math.min(Math.max(monthsElapsed - already, 0), MAX_MONTHS_CHARGE);
      const balance = Number(userSnap.data()?.balance) || 0;
      const affordable = Math.min(due, Math.floor(balance / MAINTENANCE_FEE));
      if (affordable <= 0) {
        if (!counterSnap.exists) {
          tx.set(counterRef, { monthsCharged: already, updatedAt: new Date() });
        }
        return { charged: false as const, monthsCharged: 0, totalFeesPaid: already, reason: due <= 0 ? "up_to_date" : "insufficient_balance" };
      }
      const totalCharge = affordable * MAINTENANCE_FEE;
      tx.update(userRef, { balance: balance - totalCharge, updatedAt: new Date() });
      tx.set(counterRef, { monthsCharged: already + affordable, updatedAt: new Date() }, { merge: true });
      for (let i = 0; i < affordable; i++) {
        const feeDate = new Date(createdAt);
        feeDate.setMonth(feeDate.getMonth() + already + i + 1);
        feeDate.setDate(1);
        const monthLabel = feeDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
        const monthIndex = already + i + 1;
        tx.set(adminDb.collection("bankRevenue").doc(`maint_${auth.uid}_${monthIndex}`), {
          type: "account_maintenance",
          amount: MAINTENANCE_FEE,
          sourceUid: auth.uid,
          sourceName: userName,
          referenceId: `MAINT-${auth.uid}-${monthIndex}`,
          description: `Frais d'entretien compte — ${monthLabel}`,
          currency: "FCFA",
          createdAt: new Date(),
        });
      }
      tx.set(adminDb.collection("transactions").doc(`maint_${auth.uid}_${already + affordable}`), {
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
        receiptId: `MAINT-${auth.uid}-${already + affordable}`,
        createdAt: new Date(),
      });
      return { charged: true as const, amount: totalCharge, monthsCharged: affordable, totalFeesPaid: already + affordable };
    });

    if (!charge.charged) {
      const nextDue = getNextDueDate(createdAt, now);
      return NextResponse.json({
        charged: false,
        reason: charge.reason,
        monthsCharged: 0,
        totalFeesPaid: charge.totalFeesPaid,
        nextDueDate: nextDue,
      });
    }

    const totalCharge = charge.amount;
    const monthsToCharge = charge.monthsCharged;

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
      totalFeesPaid: charge.totalFeesPaid,
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
