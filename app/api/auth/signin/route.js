import { COOKIE, authConfigured, cookieOptions, signSession } from "@/lib/session";
import { dbConfigured } from "@/lib/db";
import { json } from "@/lib/authServer";
import { checkPassword, cleanId, clearFails, getUser, isAdminLogin, takeAttempt, touchLogin, validId } from "@/lib/users";

export const runtime = "nodejs";
const WRONG = "ID number or password is incorrect.";

export async function POST(req) {
  if (!authConfigured()) return json({ error: "Sign-in isn't set up yet (AUTH_SECRET missing)." }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const id = cleanId(body.id);
  const password = typeof body.password === "string" ? body.password : "";
  if (!id || !password) return json({ error: "Enter your ID number and password." }, 400);
  if (password.length > 200) return json({ error: WRONG }, 401);

  // The admin signs in separately at /admin/signin
  if (isAdminLogin(id, password)) return json({ error: "Admin sign-in is separate. Use the admin sign-in page." }, 403);
  if (!validId(id)) return json({ error: WRONG }, 401);
  if (!dbConfigured()) return json({ error: "Accounts database isn't connected yet." }, 503);

  if (!(await takeAttempt(id))) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const u = await getUser(id);
  if (!u || !(await checkPassword(u, password))) return json({ error: WRONG }, 401);
  await clearFails(id);
  if (u.status === "pending") return json({ error: "Your account is waiting for approval." }, 403);
  if (u.status === "disabled") return json({ error: "This account has been disabled." }, 403);
  if (u.status !== "approved") return json({ error: WRONG }, 401);
  await touchLogin(id);
  const token = await signSession({ id, role: "user", ver: u.ver });
  return json({ ok: true, role: "user" }, 200, { "Set-Cookie": `${COOKIE}=${token}; ${cookieOptions()}` });
}
