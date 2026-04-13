import { NextResponse } from "next/server";
import { getAdminAuth, getAuthMode } from "@/lib/auth-verify";

/**
 * GET /api/debug/auth-status
 *
 * Diagnostic endpoint — reveals Admin SDK initialization status.
 * Returns detailed info about what went wrong during init.
 * REMOVE AFTER DEBUGGING.
 */
export async function GET() {
  const mode = await getAuthMode();

  const envSet = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const envStartsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS?.startsWith("{") ?? false;
  const envLength = process.env.GOOGLE_APPLICATION_CREDENTIALS?.length ?? 0;
  const envPreview = process.env.GOOGLE_APPLICATION_CREDENTIALS?.substring(0, 50) ?? "(not set)";

  return NextResponse.json({
    authMode: mode,
    envVar: {
      set: envSet,
      startsWithJson: envStartsJson,
      valueLength: envLength,
      preview: envPreview,
    },
    timestamp: new Date().toISOString(),
  });
}
