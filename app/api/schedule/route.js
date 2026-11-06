// Look up blocks and runs from the public schedule (no live bus needed).
//   ?q=C01      search  (add &routes=94,96 to include every block on those routes today)
//   ?block=C01-31   a block's schedule today
//   ?run=<id>       a run laid out for today
import { getSession, json } from "@/lib/authServer";
import { blockLookup, lookupRange, pickDate, runLookup, searchSchedule } from "@/lib/schedule";

export const runtime = "nodejs";

export async function GET(req) {
  if (!(await getSession(req))) return json({ error: "Sign in required" }, 401);
  const q = new URL(req.url).searchParams;
  const date = pickDate(q.get("date"));
  if (!date) return json({ error: "That date is outside the schedule the app has. Pick a day in range.", range: lookupRange() }, 400);
  if (q.get("range")) return json(lookupRange());
  if (q.get("block")) {
    const d = await blockLookup(String(q.get("block")).trim().slice(0, 40), date);
    return d ? json(d) : json({ error: "That block doesn't run on that day." }, 404);
  }
  if (q.get("run")) {
    const d = await runLookup(String(q.get("run")).slice(0, 40), date);
    return d ? json(d) : json({ error: "No such run." }, 404);
  }
  const routeIds = String(q.get("routes") || "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9-]{1,10}$/.test(s)).slice(0, 5);
  return json({ ...(await searchSchedule(q.get("q") || "", { routeIds, date })), range: lookupRange() });
}
