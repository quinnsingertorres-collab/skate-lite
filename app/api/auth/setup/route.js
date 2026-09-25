import { dbConfigured } from "@/lib/db";
import { json } from "@/lib/authServer";
import { cleanId, isLocked, recordFail, requestAccount, validId } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(req) {
  if (!dbConfigured()) return json({ error: "Accounts database isn't connected yet." }, 503);
  const { id: rawId, password = "", confirm = "" } = await req.json().catch(() => ({}));
  const id = cleanId(rawId);
  if (!validId(id)) return json({ error: "Enter the ID number you were given." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  if (password.length > 200) return json({ error: "Password is too long." }, 400);
  if (password !== confirm) return json({ error: "Passwords don't match." }, 400);
  if (await isLocked(id)) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const r = await requestAccount(id, password);
  if (!r.ok) {
    await recordFail(id);
    return json({ error: r.error }, 400);
  }
  return json({ ok: true, message: "Account created. It will work once it's approved." });
}
