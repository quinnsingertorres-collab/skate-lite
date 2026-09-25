import { COOKIE, authConfigured, cookieOptions, signSession } from "@/lib/session";
import { dbConfigured } from "@/lib/db";
import { json } from "@/lib/authServer";
import { adminVersion, checkPassword, cleanId, clearFails, getUser, isAdminLogin, isLocked, recordFail, touchLogin } from "@/lib/users";

export const runtime = "nodejs";
const WRONG = "ID number or password is incorrect.";

export async function POST(req) {
  if (!authConfigured()) return json({ error: "Sign-in isn't set up yet (AUTH_SECRET missing)." }, 503);
  const { id: rawId, password = "" } = await req.json().catch(() => ({}));
  const id = cleanId(rawId);
  if (!id || !password) return json({ error: "Enter your ID number and password." }, 400);

  const ok = async (payload) => {
    const token = await signSession(payload);
    return json({ ok: true, role: payload.role }, 200, { "Set-Cookie": `${COOKIE}=${token}; ${cookieOptions()}` });
  };

  if (isAdminLogin(id, password)) return ok({ id, role: "admin", ver: adminVersion() });
  if (!dbConfigured()) return json({ error: "Accounts database isn't connected yet." }, 503);

  if (await isLocked(id)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const u = await getUser(id);
  if (!u || !(await checkPassword(u, password))) {
    await recordFail(id);
    return json({ error: WRONG }, 401);
  }
  await clearFails(id);
  if (u.status === "pending") return json({ error: "Your account is waiting for approval." }, 403);
  if (u.status === "disabled") return json({ error: "This account has been disabled." }, 403);
  if (u.status !== "approved") return json({ error: WRONG }, 401);
  await touchLogin(id);
  return ok({ id, role: "user", ver: u.ver });
}
