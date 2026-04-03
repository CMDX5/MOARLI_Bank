import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/admin-firestore";

/**
 * GET /api/health — Health check.
 * Always returns 200 with diagnostic info.
 */
export async function GET() {
  const startTime = Date.now();
  const info: Record<string, unknown> = {
    status: "ok",
    version: "2.3.0",
    timestamp: new Date().toISOString(),
    database: "firestore",
    nodeEnv: process.env.NODE_ENV,
  };

  // Check Firebase Admin SDK (non-blocking)
  try {
    const adminDb = await getAdminFirestore();
    if (adminDb) {
      info.firebaseAdmin = "ok";

      // Try a simple get instead of count (more compatible)
      try {
        const testRef = adminDb.collection("moraliUsers").limit(1);
        await testRef.get();
        info.firestoreRead = "ok";
      } catch (fsErr: unknown) {
        info.firestoreRead = "error";
        info.firestoreReadError = fsErr instanceof Error ? fsErr.message : String(fsErr);
      }
    } else {
      info.firebaseAdmin = "not_configured";
      info.firebaseHint = "GOOGLE_APPLICATION_CREDENTIALS or service-account-key.json not found";
    }
  } catch (err: unknown) {
    info.firebaseAdmin = "error";
    info.firebaseError = err instanceof Error ? err.message : String(err);
  }

  info.responseTime = `${Date.now() - startTime}ms`;
  info.memory = typeof process !== "undefined" && process.memoryUsage
    ? `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    : "N/A";

  return NextResponse.json(info, {
    status: 200,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
