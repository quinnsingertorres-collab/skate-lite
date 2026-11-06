// Operator roster: names + operator IDs. Roster access only.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { displayName } from "@/lib/users";
import { runDefs } from "@/lib/runs";
import { currentSeason } from "@/lib/season";
import { DAYS, OPERATOR_ID_RE, canUseRoster, deleteOperator, readRoster, saveOperator, saveSchedule, todayKey } from "@/lib/roster";

export const runtime = "nodejs";

async function gate(req) {
  const s = await getSession(req);
  if (!s) return { res: json({ error: "Sign in required" }, 401) };
  if (!(await canUseRoster(s))) return { res: json({ error: "You don't have roster access. Ask the admin." }, 403) };
  if (!dbConfigured()) return { res: json({ error: "Database not connected" }, 503) };
  return { s };
}

export async function GET(req) {
  const { res } = await gate(req); if (res) return res;
  const { operators, schedules } = await readRoster();
  const runs = (await runDefs()).map((d) => ({ id: d.id, run: d.run })).sort((a, b) => a.run.localeCompare(b.run));
  const list = Object.values(operators).map((o) => ({ ...o, days: schedules[o.operatorId]?.days || {} })).sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.operatorId.localeCompare(b.operatorId));
  return json({ season: currentSeason(), today: todayKey(), days: DAYS, operators: list, runs });
}

export async function POST(req) {
  const { s, res } = await gate(req); if (res) return res;
  const body = (await req.json().catch(() => null)) || {};
  const operatorId = String(body.operatorId || "").trim().toUpperCase();
  const name = String(body.name || "").trim().slice(0, 60);
  if (!OPERATOR_ID_RE.test(operatorId)) return json({ error: "Operator ID can be letters, numbers and dashes (up to 12)." }, 400);
  if (!name) return json({ error: "Enter the operator's name." }, 400);
  const { operators, schedules } = await readRoster();
  const oldId = body.oldId ? String(body.oldId).toUpperCase() : null;
  if (operators[operatorId] && operatorId !== oldId) return json({ error: `Operator #${operatorId} is already on the roster.` }, 409);
  await saveOperator({ operatorId, name, by: s.id, byName: await displayName(s).catch(() => ""), at: Math.floor(Date.now() / 1000) });
  if (oldId && oldId !== operatorId && operators[oldId]) {
    // Changed ID: keep the schedule
    if (schedules[oldId]) await saveSchedule(operatorId, schedules[oldId].days || {}, {});
    await deleteOperator(oldId);
  }
  return json({ ok: true });
}

export async function DELETE(req) {
  const { res } = await gate(req); if (res) return res;
  const id = String(new URL(req.url).searchParams.get("id") || "").toUpperCase();
  if (!id) return json({ error: "Missing operator" }, 400);
  await deleteOperator(id);
  return json({ ok: true });
}
