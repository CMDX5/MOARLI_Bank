/**
 * Call this from the CLIENT side to log admin actions.
 * It sends the action to the API route which handles auth + DB write.
 * Pass custom headers (with auth token) for client-side calls.
 */
export async function logAdminAction(action: string, details: string, target?: string, customHeaders?: Record<string, string>): Promise<void> {
  try {
    await fetch("/api/admin/audit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...customHeaders },
      body: JSON.stringify({ action, target, details }),
    });
  } catch {
    // Silent fail — don't break admin actions if logging fails
  }
}
