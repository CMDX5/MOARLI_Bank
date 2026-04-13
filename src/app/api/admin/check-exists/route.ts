import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";
import { rateLimitByIp, getClientId } from "@/lib/rate-limit";

/**
 * Admin Check Exists API
 *
 * Returns whether an admin account has been created.
 * Uses a Firestore document config/adminExists as the source of truth.
 * Rate limited: 10 req/min.
 */
export async function GET(req: Request) {
  const clientId = getClientId(req as any);
  const rl = rateLimitByIp(`admin:check:${clientId}`, { maxRequests: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  try {
    const adminDb = await getAdminFirestore();
    if (!adminDb) {
      // Firestore not configured — fall back to env var
      const adminEmail = process.env.ADMIN_EMAIL;
      return NextResponse.json({
        adminExists: !!adminEmail,
        adminEmail: adminEmail || null,
      });
    }

    const configRef = adminDb.doc("config/adminExists");
    const snap = await configRef.get();

    if (snap.exists) {
      const data = snap.data();
      return NextResponse.json({
        adminExists: true,
        adminEmail: data.adminEmail || null,
      });
    }

    return NextResponse.json({
      adminExists: false,
      adminEmail: null,
    });
  } catch {
    // On error, fall back to env var
    const adminEmail = process.env.ADMIN_EMAIL;
    return NextResponse.json({
      adminExists: !!adminEmail,
      adminEmail: adminEmail || null,
    });
  }
}
