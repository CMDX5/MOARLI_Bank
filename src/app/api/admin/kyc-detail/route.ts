import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-verify";
import { rateLimit } from "@/lib/rate-limit";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * GET /api/admin/kyc-detail?uid=xxx
 *
 * Returns a single KYC record WITH document images for admin review.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const rl = await rateLimit(auth.uid, "admin:kyc:detail", { maxRequests: 20, windowSec: 60 });
  if (!rl.allowed) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const url = new URL(req.url);
    const targetUid = url.searchParams.get("uid");

    if (!targetUid || !/^[a-zA-Z0-9_-]{1,128}$/.test(targetUid)) {
      return NextResponse.json({ error: "UID invalide" }, { status: 400 });
    }

    const docSnap = await adminDb.collection("kycRecords").doc(targetUid).get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Enregistrement KYC introuvable" }, { status: 404 });
    }

    const data = docSnap.data()!;

    return NextResponse.json({
      success: true,
      record: {
        uid: docSnap.id,
        status: data.status,
        documentType: data.documentType,
        documentFront: data.documentFront || null,
        documentBack: data.documentBack || null,
        selfiePhoto: data.selfiePhoto || null,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        documentNumber: data.documentNumber,
        submittedAt: data.submittedAt,
        reviewedAt: data.reviewedAt || null,
        reviewerNotes: data.reviewerNotes || null,
        reviewerUid: data.reviewerUid || null,
      },
    });
  } catch (err) {
    console.error("[admin:kyc:detail] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
