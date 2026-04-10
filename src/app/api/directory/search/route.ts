import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp, getClientId, rateLimit } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * Directory Search API — FIRESTORE VERSION (with moraliUsers fallback)
 * 
 * Search strategy:
 * 1. directoryLookup — O(1) lookup (fast)
 * 2. moraliUsers collection — query fallback (catches migrated users)
 * 3. Auto-backfill directoryLookup when found via moraliUsers
 * 
 * Returns 503 only if Admin SDK is not configured AND no cached result.
 */

function formatResult(d: { uid: string; fullName?: string; pseudo?: string; moraliId?: string; phone?: string }) {
  return {
    found: true,
    name: d.fullName || "Utilisateur",
    pseudo: d.pseudo?.startsWith("@") ? d.pseudo : `@${d.pseudo || ""}`,
    account: d.moraliId || "",
    // SECURITY: uid is NEVER exposed to client (prevents IDOR / user enumeration)
    // SECURITY: phone is masked — only last 2 digits shown
    ...(d.phone ? { phone: `******${String(d.phone).slice(-2)}` } : {}),
  };
}

export async function GET(req: NextRequest) {
  // ── Rate limit ──
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`directory:search:${clientId}`, { maxRequests: 40, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
    });
  }

  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ found: false }, { status: 401 });

  try {
    const rawQuery = req.nextUrl.searchParams.get("q") || "";
    const query = rawQuery.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ found: false });
    }

    if (query.length > 100) {
      return NextResponse.json({ found: false, error: "Requête trop longue" }, { status: 400 });
    }

    const sanitizedQuery = query.replace(/[^a-zA-Z0-9@._-]/g, "");
    if (!sanitizedQuery || sanitizedQuery.length < 2) {
      return NextResponse.json({ found: false });
    }

    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      // Admin SDK not configured — client must use direct Firestore fallback
      // Return a special signal so client knows to search directly
      return NextResponse.json({ found: false, useClientFallback: true });
    }

    const normalizedMoraliId = sanitizedQuery.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalizedPseudo = sanitizedQuery.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");

    // ── Layer 1: Search directoryLookup — O(1) ──
    if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
      const lookupDoc = await adminDb.collection("directoryLookup").doc(`morali_${normalizedMoraliId}`).get();
      if (lookupDoc.exists()) {
        return NextResponse.json(formatResult(lookupDoc.data()!));
      }
    }

    if (normalizedPseudo.length >= 2) {
      const lookupDoc = await adminDb.collection("directoryLookup").doc(`pseudo_${normalizedPseudo}`).get();
      if (lookupDoc.exists()) {
        return NextResponse.json(formatResult(lookupDoc.data()!));
      }

      // Prefix search — limited to 3 results max
      const prefixResults = await adminDb.collection("directoryLookup")
        .where("pseudo", ">=", normalizedPseudo)
        .where("pseudo", "<=", normalizedPseudo + "\uf8ff")
        .limit(3)
        .get();

      if (!prefixResults.empty) {
        // SECURITY: return first match only — never expose full user list
        const firstMatch = prefixResults.docs[0].data()!;
        return NextResponse.json(formatResult(firstMatch));
      }
    }

    // ── Layer 2: Fallback — search moraliUsers directly ──
    // Catches users who registered before directoryLookup was populated
    try {
      if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
        const userSnap = await adminDb.collection("moraliUsers")
          .where("moraliId", "==", normalizedMoraliId)
          .limit(1)
          .get();

        if (!userSnap.empty) {
          const d = userSnap.docs[0].data()!;
          // Auto-backfill directoryLookup for next time
          adminDb.collection("directoryLookup").doc(`morali_${normalizedMoraliId}`).set({
            uid: d.uid,
            moraliId: normalizedMoraliId,
            fullName: d.fullName || "Utilisateur",
            pseudo: (d.pseudo || "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, ""),
          }, { merge: true }).catch(() => {});

          if (d.pseudo) {
            const pseudoNorm = (d.pseudo || "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
            if (pseudoNorm) {
              adminDb.collection("directoryLookup").doc(`pseudo_${pseudoNorm}`).set({
                uid: d.uid,
                moraliId: normalizedMoraliId,
                fullName: d.fullName || "Utilisateur",
                pseudo: pseudoNorm,
              }, { merge: true }).catch(() => {});
            }
          }

          return NextResponse.json(formatResult({ uid: d.uid, fullName: d.fullName, pseudo: d.pseudo, moraliId: d.moraliId, phone: d.phone }));
        }
      }
    } catch {
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error("[directory:search] Error:", err);
    return NextResponse.json({ found: false, error: "search_failed" });
  }
}
