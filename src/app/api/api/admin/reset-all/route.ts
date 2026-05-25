import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * POST /api/admin/reset-all
 * 
 * DANGER: Resets ALL application data to zero.
 * SECURITY: Protected by Firebase Custom Claims (claims.admin === true)
 * 
 * Requires: Admin Custom Claims + confirmReset: "RESET_ALL_DATA"
 */
export async function POST(req: NextRequest) {
  // SECURITY: Firebase Custom Claims — not forgeable by client
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const body = await req.json();
    const { confirmReset } = body;

    if (confirmReset !== "RESET_ALL_DATA") {
      return NextResponse.json({
        error: "Pour confirmer, envoyez { confirmReset: 'RESET_ALL_DATA' }",
      }, { status: 400 });
    }

    const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};

    // ──────────────────────────────────────────────
    // PART 1: Reset Firestore data
    // ──────────────────────────────────────────────

    // 1a. Reset all user balances to 0 in moraliUsers
    try {
      const usersSnap = await adminDb.collection("moraliUsers").get();
      let balanceResetCount = 0;
      const allDocs = usersSnap.docs;

      // Firestore batch limit is 500
      for (let i = 0; i < allDocs.length; i += 500) {
        const chunk = allDocs.slice(i, i + 500);
        const batch = adminDb.batch();
        chunk.forEach((userDoc) => {
          batch.update(userDoc.ref, {
            balance: 0,
            savingsAmount: 0,
            totalSent: 0,
            totalReceived: 0,
            updatedAt: new Date(),
          });
        });
        await batch.commit();
        balanceResetCount += chunk.length;
      }
      results["moraliUsers_balances"] = { ok: true, count: balanceResetCount };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["moraliUsers_balances"] = { ok: false, error: msg };
    }

    // 1b. Delete all transactions from Firestore
    try {
      const txSnap = await adminDb.collection("transactions").get();
      let txDeleted = 0;
      for (const txDoc of txSnap.docs) {
        await txDoc.ref.delete();
        txDeleted++;
      }
      results["firestore_transactions"] = { ok: true, count: txDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_transactions"] = { ok: false, error: msg };
    }

    // 1b2. Delete all serverTransactions from Firestore
    try {
      const stxSnap = await adminDb.collection("serverTransactions").get();
      let stxDeleted = 0;
      for (const stxDoc of stxSnap.docs) {
        await stxDoc.ref.delete();
        stxDeleted++;
      }
      results["firestore_serverTransactions"] = { ok: true, count: stxDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_serverTransactions"] = { ok: false, error: msg };
    }

    // 1c. Delete all pending credits from Firestore
    try {
      const pcSnap = await adminDb.collection("pendingCredits").get();
      let pcDeleted = 0;
      for (const pcDoc of pcSnap.docs) {
        await pcDoc.ref.delete();
        pcDeleted++;
      }
      results["firestore_pendingCredits"] = { ok: true, count: pcDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_pendingCredits"] = { ok: false, error: msg };
    }

    // 1d. Delete all notifications from Firestore
    try {
      const notifSnap = await adminDb.collection("notifications").get();
      let notifDeleted = 0;
      for (const notifDoc of notifSnap.docs) {
        await notifDoc.ref.delete();
        notifDeleted++;
      }
      results["firestore_notifications"] = { ok: true, count: notifDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_notifications"] = { ok: false, error: msg };
    }

    // 1e. Delete all pinRecords from Firestore
    try {
      const pinSnap = await adminDb.collection("pinRecords").get();
      let pinDeleted = 0;
      for (const pinDoc of pinSnap.docs) {
        await pinDoc.ref.delete();
        pinDeleted++;
      }
      results["firestore_pinRecords"] = { ok: true, count: pinDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_pinRecords"] = { ok: false, error: msg };
    }

    // 1f. Delete all kycRecords from Firestore
    try {
      const kycSnap = await adminDb.collection("kycRecords").get();
      let kycDeleted = 0;
      for (const kycDoc of kycSnap.docs) {
        await kycDoc.ref.delete();
        kycDeleted++;
      }
      results["firestore_kycRecords"] = { ok: true, count: kycDeleted };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results["firestore_kycRecords"] = { ok: false, error: msg };
    }

    // Summary
    const allOk = Object.values(results).every((r) => r.ok);
    const totalCleared = Object.values(results).reduce((sum, r) => sum + (r.count || 0), 0);

    return NextResponse.json({
      success: allOk,
      message: `Réinitialisation terminée — ${totalCleared} enregistrements supprimés`,
      details: results,
    });
  } catch (err) {
    console.error("[admin/reset-all] Error:", err);
    return NextResponse.json({ error: "Erreur lors de la réinitialisation" }, { status: 500 });
  }
}
