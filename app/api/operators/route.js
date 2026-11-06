// Operator ID on a bus for today. Anyone signed in can set, change or clear it.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { getUser } from "@/lib/users";
import { OPERATOR_RE, setOperator } from "@/lib/runs";

export const runtime = "nodejs";

export async function POST(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const vehicle = String(body.vehicle || "").trim().slice(0, 12);
  const op = String(body.operatorId ?? "").trim().toUpperCase();
  if (!/^[A-Za-z0-9-]{1,12}$/.test(vehicle)) return json({ error: "Missing bus number" }, 400);
  if (op && !OPERATOR_RE.test(op)) return json({ error: "Operator ID can be letters, numbers and dashes (up to 12)." }, 400);
  if (!op) { await setOperator(vehicle, null); return json({ ok: true, cleared: true }); }
  const u = await getUser(s.id);
  const entry = { operatorId: op, by: s.id, byName: u?.name || (s.role === "admin" ? "Admin" : ""), at: Math.floor(Date.now() / 1000) };
  await setOperator(vehicle, entry);
  return json({ ok: true, ...entry });
}
