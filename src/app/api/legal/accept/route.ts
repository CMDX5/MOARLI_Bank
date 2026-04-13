import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { adminApp } from "@/lib/firebase-admin";

/**
 * POST /api/legal/accept
 * Enregistre l'acceptation d'un document légal (CGU ou Politique de confidentialité)
 * avec la version et un horodatage dans Firestore.
 *
 * Body:
 *   { type: "terms" | "privacy", version: string }
 *
 * Sécurité : Vérification Firebase Admin SDK (token utilisateur)
 */

const POLICY_VERSIONS = {
  terms: "2.0",
  privacy: "2.0",
} as const;

export async function POST(req: NextRequest) {
  try {
    const auth = getAuth(adminApp);
    const authorization = req.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    const body = await req.json();
    const { type, version } = body as { type?: string; version?: string };

    if (!type || !["terms", "privacy"].includes(type)) {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    const acceptedVersion = version || POLICY_VERSIONS[type as keyof typeof POLICY_VERSIONS];

    const db = getFirestore(adminApp);

    await db.collection("users").doc(uid).set({
      legalAcceptances: {
        [type === "terms" ? "termsOfService" : "privacyPolicy"]: {
          version: acceptedVersion,
          acceptedAt: FieldValue.serverTimestamp(),
          ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
          userAgent: req.headers.get("user-agent") || null,
        },
      },
    }, { merge: true });

    return NextResponse.json({
      success: true,
      type,
      version: acceptedVersion,
      message: `Acceptation enregistrée avec succès`,
    });
  } catch (error) {
    console.error("[legal/accept] Error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * GET /api/legal/accept?type=privacy
 * Vérifie si l'utilisateur a déjà accepté un document légal.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = getAuth(adminApp);
    const authorization = req.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(authorization.slice(7));
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Token invalide" }, { status: 401 });
    }

    const type = req.nextUrl.searchParams.get("type");
    if (!type || !["terms", "privacy"].includes(type)) {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    const db = getFirestore(adminApp);
    const doc = await db.collection("users").doc(uid).get();
    const data = doc.data();
    const fieldName = type === "terms" ? "termsOfService" : "privacyPolicy";
    const acceptance = data?.legalAcceptances?.[fieldName];

    return NextResponse.json({
      accepted: !!acceptance,
      version: acceptance?.version || null,
      acceptedAt: acceptance?.acceptedAt || null,
      currentVersion: POLICY_VERSIONS[type as keyof typeof POLICY_VERSIONS],
    });
  } catch (error) {
    console.error("[legal/accept] GET Error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
