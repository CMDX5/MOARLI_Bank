import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { requireAuth } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";
import { auditLog, AUDIT_ACTIONS, getClientIp } from "@/lib/audit-log";

/**
 * POST /api/account/delete-request
 *
 * GDPR Article 17 — Right to erasure (droit à l'oubli).
 *
 * Creates a deletion request that an admin must approve before actual deletion.
 * The user's data is NOT deleted immediately — it follows a 2-step process:
 * 1. User requests deletion (this endpoint)
 * 2. Admin approves deletion via /api/admin/delete-user (existing endpoint)
 *
 * This ensures:
 * - User identity is verified (auth required)
 * - Rate limited (prevents abuse)
 * - Audit trail is maintained
 * - Admin oversight before destructive action
 */
export async function POST(req: NextRequest) {
  // ── 1. Auth check ──
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // ── 2. Rate limit: 1 deletion request per hour ──
  const rl = await rateLimit(auth.uid, "account:delete-request", {
    maxRequests: 1,
    windowSec: 3600,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Une demande de suppression a déjà été soumise récemment. Veuillez réessayer dans une heure." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // ── 3. Get Admin Firestore ──
  const adminDb = await getAdminFirestore();
  if (!adminDb) {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }

  try {
    // ── 4. Check if a pending request already exists ──
    const existingRequests = await adminDb
      .collection("accountDeletionRequests")
      .where("uid", "==", auth.uid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingRequests.empty) {
      return NextResponse.json(
        { error: "Une demande de suppression est déjà en attente de traitement par un administrateur." },
        { status: 409 }
      );
    }

    // ── 5. Get user info for the request ──
    const userDoc = await adminDb.collection("moraliUsers").doc(auth.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const userEmail = userData?.email || "";
    const userName = userData?.fullName || "Utilisateur";
    const userMoraliId = userData?.moraliId || "";

    // ── 6. Create the deletion request ──
    const docRef = await adminDb.collection("accountDeletionRequests").add({
      uid: auth.uid,
      email: userEmail,
      fullName: userName,
      moraliId: userMoraliId,
      status: "pending",
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      adminNote: "",
    });

    // ── 7. Audit log ──
    await auditLog({
      uid: auth.uid,
      action: AUDIT_ACTIONS.ACCOUNT_DELETE_REQUESTED,
      details: {
        requestId: docRef.id,
        email: userEmail,
        moraliId: userMoraliId,
      },
      ip: getClientIp(req),
      level: "warning",
    });

    return NextResponse.json({
      success: true,
      message: "Votre demande de suppression de compte a été enregistrée. Un administrateur traitera votre demande dans les 30 jours.",
      requestId: docRef.id,
    });
  } catch (err) {
    console.error("[account/delete-request] Error:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
