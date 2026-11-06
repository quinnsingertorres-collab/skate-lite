// Set an operator's weekly schedule: which run they work each day (or off). Roster access only.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { displayName } from "@/lib/users";
import { runDefs } from "@/lib/runs";
import { DAYS, canUseRoster, readRoster, saveSchedule } from "@/lib/roster";

export const runtime = "nodejs";

export async function POST(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!(await canUseRoster(s))) return json({ error: "You don't have roster access." }, 403);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const id = String(body.operatorId || "").toUpperCase();
  const { operators, schedules } = await readRoster();
  if (!operators[id]) return json({ error: "That operator isn't on the roster." }, 404);
  const runs = new Map((await runDefs()).map((d) => [d.id, d.run]));
  const days = {};
  for (const d of DAYS) {
    const r = body.days?.[d] ? String(body.days[d]) : "";
    if (r && !runs.has(r)) return json({ error: "One of those runs no longer exists." }, 400);
    if (r) days[d] = r;
  }
  // A run can only have one operator on a given day
  for (const [other, sch] of Object.entries(schedules)) {
    if (other === id) continue;
    for (const d of DAYS) if (days[d] && sch?.days?.[d] === days[d]) {
      return json({ error: `Run ${runs.get(days[d])} on ${d[0].toUpperCase() + d.slice(1)} is already ${(operators[other]?.name || "#" + other).toUpperCase()}'s.` }, 409);
    }
  }
  await saveSchedule(id, days, { by: s.id, byName: await displayName(s).catch(() => ""), at: Math.floor(Date.now() / 1000) });
  return json({ ok: true, days });
}
