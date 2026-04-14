import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { randomBytes } from "crypto";

// ── Confirm token store ──
// SECURITY FIX: Use cryptographic tokens instead of predictable formula.
// Tokens are stored in Firestore and expire after 5 minutes.

const CONFIRM_TOKEN_COLLECTION = "adminConfirmTokens";
const CONFIRM_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function createConfirmToken(
  adminDb: any,
  uid: string,
  action: string
): Promise<string> {
  const token = `cfm_${randomBytes(32).toString("hex")}`;
  await adminDb.collection(CONFIRM_TOKEN_COLLECTION).doc(token).set({
    uid,
    action,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + CONFIRM_TOKEN_TTL_MS),
  });
  return token;
}

async function verifyConfirmToken(
  adminDb: any,
  token: string,
  uid: string,
  action: string
): Promise<boolean> {
  if (!token) return false;

  try {
    const docRef = adminDb.collection(CONFIRM_TOKEN_COLLECTION).doc(token);
    const snap = await docRef.get();

    if (!snap.exists) return false;

    const data = snap.data();
    if (data.uid !== uid || data.action !== action) return false;
    if (Date.now() > new Date(data.expiresAt).getTime()) {
      await docRef.delete().catch(() => {});
      return false;
    }

    // One-time use — delete after verification
    await docRef.delete().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // SECURITY: Firebase Custom Claims
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Rate limit (uid-based, after auth) — stricter for destructive operations
  const rl = await rateLimit(auth.uid, "admin:log:POST", { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const body = await req.json();
    const { action, details, confirmToken } = body;

    if (!action) {
      return NextResponse.json({ error: "Action requise" }, { status: 400 });
    }

    // ══════════════════════════════════════════════════
    // Destructive reset actions — require cryptographic confirmation token
    // ══════════════════════════════════════════════════
    const isResetAction = action === "RESET_TRANSACTIONS" || action === "RESET_NOTIFICATIONS" || action === "RESET_BALANCES" || action === "RESET_ALL";

    if (isResetAction) {
      // SECURITY FIX: Verify cryptographic token instead of predictable formula
      const valid = await verifyConfirmToken(adminDb, confirmToken, auth.uid, action);
      if (!valid) {
        return NextResponse.json({ error: "Jeton de confirmation invalide ou expiré" }, { status: 403 });
      }

      if (action === "RESET_TRANSACTIONS") {
        const snap = await adminDb.collection("transactions").get();
        for (const docSnap of snap.docs) await docSnap.ref.delete();
        try {
          const pc = await adminDb.collection("pendingCredits").get();
          for (const d of pc.docs) await d.ref.delete();
        } catch { /* pendingCredits may not exist */ }
        return NextResponse.json({ success: true, message: `${snap.size} transactions supprimées` });
      }

      if (action === "RESET_NOTIFICATIONS") {
        const usersSnap = await adminDb.collection("moraliUsers").get();
        let count = 0;
        for (const userDoc of usersSnap.docs) {
          try {
            const notifs = await adminDb.collection("users", userDoc.id, "notifications").get();
            const batch = adminDb.batch();
            notifs.docs.forEach((d: any) => { batch.delete(d.ref); count++; });
            if (notifs.size > 0) await batch.commit();
          } catch { /* subcollection may not exist */ }
        }
        try {
          const sn = await adminDb.collection("serverNotifications").get();
          for (const d of sn.docs) { await d.ref.delete(); count++; }
        } catch { /* collection may not exist */ }
        return NextResponse.json({ success: true, message: `${count} notifications supprimées` });
      }

      if (action === "RESET_BALANCES") {
        const usersSnap = await adminDb.collection("moraliUsers").get();
        const batch = adminDb.batch();
        usersSnap.docs.forEach((userDoc: any) => {
          batch.update(userDoc.ref, {
            balance: 0,
            savingsAmount: 0,
            totalSent: 0,
            totalReceived: 0,
            updatedAt: new Date(),
          });
        });
        if (usersSnap.size > 0) await batch.commit();
        return NextResponse.json({ success: true, message: `Soldes réinitialisés pour ${usersSnap.size} utilisateurs` });
      }

      if (action === "RESET_ALL") {
        const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};

        try {
          const usersSnap = await adminDb.collection("moraliUsers").get();
          const allDocs = usersSnap.docs;
          for (let i = 0; i < allDocs.length; i += 500) {
            const chunk = allDocs.slice(i, i + 500);
            const batch = adminDb.batch();
            chunk.forEach((userDoc: any) => {
              batch.update(userDoc.ref, {
                balance: 0, savingsAmount: 0, totalSent: 0, totalReceived: 0, updatedAt: new Date(),
              });
            });
            await batch.commit();
          }
          results["moraliUsers_balances"] = { ok: true, count: allDocs.length };

          for (const collName of ["transactions", "pendingCredits", "serverNotifications"]) {
            try {
              const snap = await adminDb.collection(collName).get();
              for (const docSnap of snap.docs) await docSnap.ref.delete();
              results[collName] = { ok: true, count: snap.size };
            } catch (err: unknown) {
              results[collName] = { ok: false, error: err instanceof Error ? err.message.slice(0, 80) : "unknown" };
            }
          }

          let notifCount = 0;
          for (const userDoc of allDocs) {
            try {
              const notifs = await adminDb.collection("users", userDoc.id, "notifications").get();
              const batch = adminDb.batch();
              notifs.docs.forEach((d: any) => { batch.delete(d.ref); notifCount++; });
              if (notifs.size > 0) await batch.commit();
            } catch { /* skip */ }
          }
          results["user_notifications"] = { ok: true, count: notifCount };

          const totalCleared = Object.values(results).reduce((s, r) => s + (r.count || 0), 0);
          return NextResponse.json({
            success: true,
            message: `Reset terminé — ${totalCleared} enregistrements supprimés`,
            details: results,
          });
        } catch (err: unknown) {
          return NextResponse.json({ error: err instanceof Error ? err.message.slice(0, 100) : "Erreur reset" }, { status: 500 });
        }
      }
    }

    // ── REQUEST confirmation token ──
    if (action === "REQUEST_CONFIRM") {
      const targetAction = details; // The action to confirm (e.g., "RESET_ALL")
      if (!targetAction) {
        return NextResponse.json({ error: "Action cible requise dans 'details'" }, { status: 400 });
      }
      const token = await createConfirmToken(adminDb, auth.uid, targetAction);
      return NextResponse.json({
        success: true,
        confirmToken: token,
        expiresIn: CONFIRM_TOKEN_TTL_MS / 1000,
        message: `Jeton de confirmation généré. Valide pendant ${CONFIRM_TOKEN_TTL_MS / 1000} secondes.`,
      });
    }

    // Normal admin log entry
    await adminDb.collection("adminActivity").add({
      action: String(action).slice(0, 100),
      details: String(details || "").slice(0, 500),
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  // SECURITY: Firebase Custom Claims
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Rate limit (uid-based, after auth)
  const rl = await rateLimit(auth.uid, "admin:log:GET", { maxRequests: 60, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);
    const logsSnap = await adminDb
      .collection("adminActivity")
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    const logs = logsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [] }, { status: 200 });
  }
}
