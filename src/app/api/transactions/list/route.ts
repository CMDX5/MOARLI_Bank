import { NextRequest, NextResponse } from "next/server";
import { query, where, getDocs, limit as queryLimit, orderBy } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/auth-verify";

/**
 * Transaction List API — IDOR-PROTECTED
 *
 * Security:
 * - uid is extracted from Firebase token ONLY (never from request body)
 * - Returns only transactions where the authenticated user is sender OR recipient
 * - Rate limited per authenticated client
 * - Results capped at 50 per query
 */
export async function GET(req: NextRequest) {
  // ── Rate limit ──
  const clientId = getClientId(req);
  const rl = rateLimitByIp(`tx:list:${clientId}`, { maxRequests: 30, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  // ── Auth: extract uid from Firebase token ONLY ──
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const secureUid = auth.uid; // ONLY from verified token — never from body/query

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
    }

    // Parse pagination params
    const url = req.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") || "20", 10) || 20));
    const offset = (page - 1) * perPage;

    // Query serverTransactions where user is sender OR recipient
    // Security: uid comes from token, NOT from request parameters
    const [sentSnap, receivedSnap] = await Promise.all([
      getDocs(
        query(
          adminDb.collection("serverTransactions"),
          where("senderUid", "==", secureUid),
          orderBy("createdAt", "desc"),
          queryLimit(perPage)
        )
      ),
      getDocs(
        query(
          adminDb.collection("serverTransactions"),
          where("recipientUid", "==", secureUid),
          orderBy("createdAt", "desc"),
          queryLimit(perPage)
        )
      ),
    ]);

    // Merge and deduplicate by document ID
    const txMap = new Map<string, unknown>();
    for (const snap of [sentSnap, receivedSnap]) {
      for (const doc of snap.docs) {
        if (!txMap.has(doc.id)) {
          txMap.set(doc.id, { id: doc.id, ...doc.data() });
        }
      }
    }

    // Sort by createdAt descending (server-side)
    let transactions = Array.from(txMap.values());
    transactions.sort((a: unknown, b: unknown) => {
      const ta = (a as Record<string, unknown>).createdAt;
      const tb = (b as Record<string, unknown>).createdAt;
      const tsa = ta && typeof ta === "object" && "seconds" in (ta as object)
        ? ((ta as { seconds: number }).seconds) * 1000
        : 0;
      const tsb = tb && typeof tb === "object" && "seconds" in (tb as object)
        ? ((tb as { seconds: number }).seconds) * 1000
        : 0;
      return tsb - tsa;
    });

    // Apply pagination offset
    const paginatedTxs = transactions.slice(offset, offset + perPage);

    // Sanitize response — remove internal fields
    const sanitized = paginatedTxs.map((tx: unknown) => {
      const t = tx as Record<string, unknown>;
      return {
        id: t.id,
        receiptId: t.receiptId,
        senderMoraliId: t.senderMoraliId,
        senderName: t.senderName,
        recipientMoraliId: t.recipientMoraliId,
        recipientName: t.recipientName,
        amount: t.amount,
        fees: t.fees,
        type: t.type,
        status: t.status,
        destination: t.destination,
        createdAt: t.createdAt,
        // NEVER expose senderUid/recipientUid to client
      };
    });

    return NextResponse.json({
      success: true,
      transactions: sanitized,
      total: transactions.length,
      page,
      perPage,
    });
  } catch (err) {
    console.error("[transactions/list] Error:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
