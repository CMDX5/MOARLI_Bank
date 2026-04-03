import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

// POST: Submit KYC documents
export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const rl = rateLimit(`kyc:submit:${clientId}`, { maxRequests: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const body = await req.json();
    const { documentType, documentFront, documentBack, selfiePhoto, fullName, dateOfBirth, documentNumber } = body;

    // Validation
    if (!documentType || !documentFront || !fullName) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    const validTypes = ["national_id", "passport", "driver_license"];
    if (!validTypes.includes(documentType)) {
      return NextResponse.json({ error: "Type de document invalide" }, { status: 400 });
    }

    // Validate image size (max 5MB base64 = ~7MB raw)
    const MAX_SIZE = 7_000_000;
    if (documentFront.length > MAX_SIZE) {
      return NextResponse.json({ error: "Image recto trop volumineuse (max 5 MB)" }, { status: 400 });
    }

    // Upsert KYC record via Firestore set with merge
    const kycData = {
      uid: auth.uid,
      status: "submitted",
      documentType: String(documentType).slice(0, 30),
      documentFront: String(documentFront).slice(0, 10_000_000),
      documentBack: documentBack ? String(documentBack).slice(0, 10_000_000) : null,
      selfiePhoto: selfiePhoto ? String(selfiePhoto).slice(0, 10_000_000) : null,
      fullName: String(fullName).slice(0, 100),
      dateOfBirth: dateOfBirth ? String(dateOfBirth).slice(0, 20) : null,
      documentNumber: documentNumber ? String(documentNumber).slice(0, 50) : null,
      submittedAt: new Date(),
      reviewedAt: null,
      reviewerNotes: null,
    };

    await adminDb.collection("kycRecords").doc(auth.uid).set(kycData, { merge: true });

    return NextResponse.json({ success: true, status: "submitted" });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

// GET: Get KYC status for current user
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const adminDb = await getAdminFirestore();
  if (!adminDb) return NextResponse.json({ error: "Service indisponible" }, { status: 503 });

  try {
    const docSnap = await adminDb.collection("kycRecords").doc(auth.uid).get();

    if (!docSnap.exists) {
      return NextResponse.json({
        verified: false,
        status: "none",
        documentType: null,
        submittedAt: null,
        reviewedAt: null,
        reviewerNotes: null,
      });
    }

    const data = docSnap.data();

    return NextResponse.json({
      verified: data?.status === "approved",
      status: data?.status || "none",
      documentType: data?.documentType || null,
      submittedAt: data?.submittedAt || null,
      reviewedAt: data?.reviewedAt || null,
      reviewerNotes: data?.reviewerNotes || null,
    });
  } catch {
    return NextResponse.json({ verified: false, status: "none" });
  }
}
