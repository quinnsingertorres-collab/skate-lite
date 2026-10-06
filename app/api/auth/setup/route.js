import { dbConfigured } from "@/lib/db";
import { json } from "@/lib/authServer";
import { cleanId, clientIp, requestAccount, takeAttempt, validId } from "@/lib/users";

export const runtime = "nodejs";
// Limits on guessing invited IDs: per ID, and per IP address across all IDs
const PER_IP = 20, PER_IP_SECS = 60 * 60;

export async function POST(req) {
  if (!dbConfigured()) return json({ error: "Accounts database isn't connected yet." }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const id = cleanId(body.id);
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  if (!validId(id)) return json({ error: "Enter the ID number you were given." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  if (password.length > 200) return json({ error: "Password is too long." }, 400);
  if (password !== confirm) return json({ error: "Passwords don't match." }, 400);
  if (!(await takeAttempt(`setup-ip:${clientIp(req)}`, PER_IP, PER_IP_SECS)) || !(await takeAttempt(`setup:${id}`)))
    return json({ error: "Too many attempts. Try again later." }, 429);
  const r = await requestAccount(id, password);
  if (!r.ok) return json({ error: r.error }, 400);
  return json({ ok: true, message: "Account created. It will work once it's approved." });
}
