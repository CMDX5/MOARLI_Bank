/**
 * Browser helper: persist non-financial profile fields through the Admin SDK.
 * Balance, role and wallets are ignored by the server.
 */
export async function syncOwnProfile(
  headers: Record<string, string>,
  profile: Record<string, unknown>,
): Promise<void> {
  const res = await fetch("/api/profile/sync", {
    method: "POST",
    headers,
    body: JSON.stringify({ profile }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "PROFILE_SYNC_FAILED");
  }
}
