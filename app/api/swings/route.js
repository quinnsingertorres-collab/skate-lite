// Swings for the Swings view: from two hours ago to six hours ahead, today's and (after
// midnight) yesterday's service days. Operator IDs from the operator schedule; names only for
// accounts with roster access.
import { getSession, json } from "@/lib/authServer";
import { todayServiceDate } from "@/lib/adherence";
import { runDefs } from "@/lib/runs";
import { swingsOn } from "@/lib/swings";
import { canUseRoster, todaysAssignments } from "@/lib/roster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  const now = Math.floor(Date.now() / 1000);
  const [defs, assigned, names] = await Promise.all([runDefs().catch(() => []), todaysAssignments().catch(() => ({})), canUseRoster(s).catch(() => false)]);
  const op = (runId) => {
    const a = assigned[runId];
    return a ? { operatorId: a.operatorId, ...(names && a.name ? { name: a.name } : {}) } : null;
  };
  const seen = new Set();
  const swings = [];
  for (const date of [todayServiceDate(now - 86400), todayServiceDate(now)]) {
    for (const w of swingsOn(date, defs)) {
      if (w.time < now - 2 * 3600 || w.time > now + 6 * 3600 || seen.has(w.id)) continue;
      seen.add(w.id);
      swings.push({ ...w, offOperator: op(w.offRun.id), onOperator: op(w.onRun.id) });
    }
  }
  swings.sort((a, b) => a.time - b.time);
  return json({ now, swings, runsBuilt: defs.length }, 200, { "Cache-Control": "private, no-store" });
}
