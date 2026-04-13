import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { validateBody } from "@/lib/validation";
import { z } from "zod";

/**
 * POST /api/legal/accept
 * Enregistre l'acceptation d'un document légal (CGU ou Politique de confidentialité)
 * avec la version et un horodatage dans Firestore.
 *
 * Body: { type: "terms" | "privacy", version?: string }
 *
 * Sécurité : Vérification Firebase Admin SDK via requireAuth + Zod validation
 */

const legalAcceptSchema = z.object({
  type: z.enum(["terms", "privacy"], "Type invalide : doit être 'terms' ou 'privacy'"),
  version: z.string().max(20).optional(),
});

const POLICY_VERSIONS = {
  terms: "2.0",
  privacy: "2.0",
} as const;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    if (!auth.uid) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const validation = validateBody(legalAcceptSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { type, version } = validation.data;

    const acceptedVersion = version || POLICY_VERSIONS[type as keyof typeof POLICY_VERSIONS];

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const fieldName = type === "terms" ? "termsOfService" : "privacyPolicy";

    await adminDb.collection("users").doc(auth.uid).set({
      legalAcceptances: {
        [fieldName]: {
          version: acceptedVersion,
          acceptedAt: new Date().toISOString(),
          ip: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
          userAgent: req.headers.get("user-agent") ? req.headers.get("user-agent")!.substring(0, 200) : null,
        },
      },
    }, { merge: true });

    return NextResponse.json({
      success: true,
      type,
      version: acceptedVersion,
      message: "Acceptation enregistrée avec succès",
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
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    if (!auth.uid) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const type = req.nextUrl.searchParams.get("type");
    if (!type || !["terms", "privacy"].includes(type)) {
      return NextResponse.json({ error: "Type invalide" }, { status: 400 });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    const fieldName = type === "terms" ? "termsOfService" : "privacyPolicy";
    const doc = await adminDb.collection("users").doc(auth.uid).get();
    const data = doc.data();
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
