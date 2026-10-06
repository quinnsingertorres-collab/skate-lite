// Admin panel sign-in (separate from the app sign-in). Uses ADMIN_ID + ADMIN_PASSWORD from Vercel.
import { ADMIN_COOKIE, authConfigured, cookieOptions, signSession } from "@/lib/session";
import { json } from "@/lib/authServer";
import { adminId, adminVersion, cleanId, clearFails, clientIp, isAdminLogin, takeAttempt } from "@/lib/users";
import { dbConfigured } from "@/lib/db";

export const runtime = "nodejs";
const ADMIN_DAYS = 7;

export async function POST(req) {
  if (!authConfigured()) return json({ error: "Sign-in isn't set up yet (AUTH_SECRET missing)." }, 503);
  if (!adminId() || (process.env.ADMIN_PASSWORD || "").length < 8)
    return json({ error: "Admin isn't set up yet. Add ADMIN_ID and ADMIN_PASSWORD (8+ characters) in Vercel, then redeploy." }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const id = cleanId(body.id);
  const password = typeof body.password === "string" ? body.password : "";
  if (!id || !password) return json({ error: "Enter the admin ID and password." }, 400);

  // Limit wrong guesses per IP address (a shared counter would let anyone lock you out)
  const lockKey = `admin-ip:${clientIp(req)}`;
  const useDb = dbConfigured();
  if (useDb && !(await takeAttempt(lockKey).catch(() => true))) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  if (!isAdminLogin(id, password)) return json({ error: "Admin ID or password is incorrect." }, 401);
  if (useDb) await clearFails(lockKey).catch(() => {});
  const token = await signSession({ id, role: "admin", ver: adminVersion() });
  return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=${token}; ${cookieOptions(ADMIN_DAYS * 86400)}` });
}
