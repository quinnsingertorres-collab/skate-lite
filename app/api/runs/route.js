// Publish (or clear) which run a bus is on today. Any signed-in user can publish;
// "I'm the operator" also attaches their operator ID and name.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { getUser } from "@/lib/users";
import { RUN_RE, clearRun, publishRun, runDay } from "@/lib/runs";

export const runtime = "nodejs";
const cleanBus = (x) => String(x || "").trim().slice(0, 12);

export async function POST(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const vehicle = cleanBus(body.vehicle);
  const run = String(body.run || "").trim().toUpperCase();
  if (!/^[A-Za-z0-9-]{1,12}$/.test(vehicle)) return json({ error: "Missing bus number" }, 400);
  if (!RUN_RE.test(run)) return json({ error: "Enter a run number (letters, numbers and dashes, up to 16)." }, 400);
  const u = await getUser(s.id);
  const entry = { run, by: s.id, byName: u?.name || "", at: Math.floor(Date.now() / 1000) };
  if (body.operating) {
    if (!u?.operatorId) return json({ error: "Add your operator ID in the menu first." }, 400);
    entry.operatorId = u.operatorId;
    entry.operatorName = u.name || "";
  }
  await publishRun(vehicle, entry);
  return json({ ok: true, vehicle, day: runDay(), ...entry });
}

export async function DELETE(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const vehicle = cleanBus(new URL(req.url).searchParams.get("vehicle"));
  if (!vehicle) return json({ error: "Missing bus number" }, 400);
  await clearRun(vehicle);
  return json({ ok: true });
}
