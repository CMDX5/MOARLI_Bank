import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { doc, setDoc, serverTimestamp, getFirestore as getClientFirestore } from "firebase/firestore";

/**
 * Directory Registration API — FIRESTORE VERSION (dual: admin + client fallback)
 * 
 * No more Supabase/PostgreSQL dependency.
 * - First tries Firebase Admin SDK (server-side, no auth needed)
 * - Falls back to client Firestore (uses authenticated user context)
 * 
 * Security:
 * - Rate limited (15 writes/min)
 * - Auth required (user can only register themselves)
 */

export async function POST(req: NextRequest) {
  // ── Rate limit ──
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`directory:register:${clientId}`, { maxRequests: 15, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const { uid, moraliId, pseudo, fullName, firstName, lastName } = body as {
      uid?: string;
      moraliId?: string;
      pseudo?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    };

    // Auth: user can only register themselves
    if (uid !== auth.uid) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // ── Validation ──
    if (!uid || !moraliId) {
      return NextResponse.json({ error: "Paramètres uid et moraliId requis" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
      return NextResponse.json({ error: "Format uid invalide" }, { status: 400 });
    }

    const moraliIdNormalized = moraliId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^MORALI\d{1,20}$/.test(moraliIdNormalized)) {
      return NextResponse.json({ error: "Format identifiant Morali invalide" }, { status: 400 });
    }

    const pseudoClean = (pseudo || "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
    if (pseudoClean.length > 20) {
      return NextResponse.json({ error: "Pseudo trop long" }, { status: 400 });
    }

    const sanitize = (s: string, maxLen: number) =>
      String(s || "").slice(0, maxLen).replace(/[<>'"&]/g, "").trim();

    const safeFullName = sanitize(fullName, 100) || "Utilisateur";
    const safeFirstName = sanitize(firstName, 50);
    const safeLastName = sanitize(lastName, 50);

    const directoryData = {
      uid,
      moraliId: moraliIdNormalized,
      moraliIdNormalized,
      pseudo: pseudoClean,
      pseudoNormalized: pseudoClean,
      fullName: safeFullName,
      firstName: safeFirstName,
      lastName: safeLastName,
      updatedAt: new Date().toISOString(),
    };

    // ── Try Firebase Admin SDK first (server-side, no rate limits) ──
    const adminDb = await getAdminFirestore();
    if (adminDb) {
      try {
        await adminDb.collection("directory").doc(uid).set(directoryData, { merge: true });

        // O(1) lookup by moraliId
        if (moraliIdNormalized) {
          await adminDb.collection("directoryLookup").doc(`morali_${moraliIdNormalized}`).set({
            uid,
            moraliId: moraliIdNormalized,
            fullName: safeFullName,
            pseudo: pseudoClean,
          }, { merge: true });
        }

        // O(1) lookup by pseudo
        if (pseudoClean) {
          await adminDb.collection("directoryLookup").doc(`pseudo_${pseudoClean}`).set({
            uid,
            moraliId: moraliIdNormalized,
            fullName: safeFullName,
            pseudo: pseudoClean,
          }, { merge: true });
        }

        return NextResponse.json({ success: true, source: "admin" });
      } catch (adminErr) {
        // Fallback: client will handle directory write directly
      }
    }

    // ── Fallback: Use the response to tell client to write directly ──
    // Client-side code will handle this via publishDirectoryEntry
    return NextResponse.json({ success: true, source: "client_fallback", data: directoryData });
  } catch (err) {
    console.error("[directory:register] Error:", err);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
