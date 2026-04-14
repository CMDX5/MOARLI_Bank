import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * GET /api/health — Health check.
 * Always returns 200 with minimal diagnostic info.
 *
 * SECURITY FIX: No longer exposes sensitive information:
 * - Removed: nodeEnv, Firebase hint, Firestore error messages, memory usage
 * - Kept: status, version, database connectivity, response time
 */
export async function GET() {
  const startTime = Date.now();
  const info: Record<string, unknown> = {
    status: "ok",
    version: "2.3.0",
    timestamp: new Date().toISOString(),
  };

  // Check Firebase Admin SDK (non-blocking)
  try {
    const adminDb = await getAdminFirestore();
    if (adminDb) {
      // SECURITY FIX: Only return connectivity status, no details
      try {
        await adminDb.collection("moraliUsers").limit(1).get();
        info.database = "connected";
      } catch {
        info.database = "degraded";
      }
    } else {
      info.database = "disconnected";
    }
  } catch {
    info.database = "disconnected";
  }

  info.responseTime = `${Date.now() - startTime}ms`;

  return NextResponse.json(info, {
    status: 200,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
