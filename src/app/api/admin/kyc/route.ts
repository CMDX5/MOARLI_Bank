import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { z } from "zod/v4";

/**
 * GET /api/admin/kyc — List all KYC submissions (for admin review)
 * POST /api/admin/kyc — Approve or reject a KYC submission
 */

const reviewSchema = z.object({
  uid: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  reviewerNotes: z.string().max(500).optional(),
});

// GET: List KYC submissions
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "admin:kyc:list", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") || "pending"; // pending | all

    let query = adminDb.collection("kycRecords").orderBy("submittedAt", "desc");

    if (statusFilter === "pending") {
      // Show submitted and under_review only
      // Firestore "in" filter
      const snapshot = await adminDb
        .collection("kycRecords")
        .where("status", "in", ["submitted", "under_review", "rejected"])
        .orderBy("submittedAt", "desc")
        .limit(50)
        .get();

      const submissions = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          ...data,
          documentFront: undefined, // Don't send full image in list — fetch separately
          documentBack: undefined,
          selfiePhoto: undefined,
          submittedAt: data.submittedAt,
          reviewedAt: data.reviewedAt || null,
        };
      });

      return NextResponse.json({ success: true, submissions });
    }

    // All submissions
    const snapshot = await adminDb
      .collection("kycRecords")
      .orderBy("submittedAt", "desc")
      .limit(50)
      .get();

    const submissions = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        ...data,
        documentFront: undefined,
        documentBack: undefined,
        selfiePhoto: undefined,
        submittedAt: data.submittedAt,
        reviewedAt: data.reviewedAt || null,
      };
    });

    return NextResponse.json({ success: true, submissions });
  } catch (err) {
    console.error("[admin:kyc:list] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// POST: Approve or reject a KYC submission
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "admin:kyc:review", { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const body = await req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }

    const { uid, action, reviewerNotes } = parsed.data;
    const kycRef = adminDb.collection("kycRecords").doc(uid);
    const kycSnap = await kycRef.get();

    if (!kycSnap.exists) {
      return NextResponse.json({ error: "Enregistrement KYC introuvable" }, { status: 404 });
    }

    const currentStatus = kycSnap.data()?.status;
    if (currentStatus === "approved") {
      return NextResponse.json({ error: "Cet utilisateur est déjà vérifié" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const now = new Date();

    await kycRef.update({
      status: newStatus,
      reviewedAt: now,
      reviewerUid: auth.uid,
      reviewerNotes: reviewerNotes || null,
    });

    // Notify user
    try {
      const notifTitle = action === "approve"
        ? "Votre identité a été vérifiée !"
        : "Votre vérification d'identité a été rejetée";
      const notifBadge = action === "approve" ? "Vérifié" : "Attention";
      const notifBadgeClass = action === "approve" ? "nb-green" : "nb-red";
      const notifBg = action === "approve" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

      await adminDb.collection("users").doc(uid).collection("notifications").add({
        title: reviewerNotes
          ? `${notifTitle} — ${reviewerNotes}`
          : notifTitle,
        time: now.toLocaleString("fr-FR", { timeZone: "Africa/Brazzaville" }),
        badge: notifBadge,
        badgeClass: notifBadgeClass,
        icon: action === "approve" ? "shield" : "bell",
        bg: notifBg,
        read: false,
        createdAt: now,
      });
    } catch { /* notification best-effort */ }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("[admin:kyc:review] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
