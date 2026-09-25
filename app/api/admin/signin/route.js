// Admin panel sign-in (separate from the app sign-in). Uses ADMIN_ID + ADMIN_PASSWORD from Vercel.
import { ADMIN_COOKIE, authConfigured, cookieOptions, signSession } from "@/lib/session";
import { json } from "@/lib/authServer";
import { adminId, adminVersion, cleanId, clearFails, isAdminLogin, isLocked, recordFail } from "@/lib/users";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
const ADMIN_DAYS = 7;

export async function POST(req) {
  if (!authConfigured()) return json({ error: "Sign-in isn't set up yet (AUTH_SECRET missing)." }, 503);
  if (!adminId() || (process.env.ADMIN_PASSWORD || "").length < 8)
    return json({ error: "Admin isn't set up yet. Add ADMIN_ID and ADMIN_PASSWORD (8+ characters) in Vercel, then redeploy." }, 503);
  const { id: rawId, password = "" } = await req.json().catch(() => ({}));
  const id = cleanId(rawId);
  if (!id || !password) return json({ error: "Enter the admin ID and password." }, 400);

  const lockKey = "admin";
  const useDb = dbConfigured();
  if (useDb && (await isLocked(lockKey).catch(() => false))) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  if (!isAdminLogin(id, password)) {
    if (useDb) await recordFail(lockKey).catch(() => {});
    return json({ error: "Admin ID or password is incorrect." }, 401);
  }
  if (useDb) await clearFails(lockKey).catch(() => {});
  const token = await signSession({ id, role: "admin", ver: adminVersion() });
  return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=${token}; ${cookieOptions(ADMIN_DAYS * 86400)}` });
}
