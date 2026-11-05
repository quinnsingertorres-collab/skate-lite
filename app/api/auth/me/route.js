import { getSession, json } from "@/lib/authServer";
import { dbConfigured, k, redis } from "@/lib/db";
import { getUser } from "@/lib/users";
import { OPERATOR_RE } from "@/lib/runs";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  const u = dbConfigured() ? await getUser(s.id).catch(() => null) : null;
  return json({ signedIn: true, id: s.id, role: s.role, name: u?.name || "", operatorId: u?.operatorId || "" });
}

/** Save (or clear) your operator ID. */
export async function PATCH(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const op = String(body.operatorId ?? "").trim().toUpperCase();
  if (op && !OPERATOR_RE.test(op)) return json({ error: "Operator ID can be letters, numbers and dashes (up to 12)." }, 400);
  if (op) await redis("HSET", k(`u:${s.id}`), "operatorId", op);
  else await redis("HDEL", k(`u:${s.id}`), "operatorId");
  return json({ ok: true, operatorId: op });
}
