// A block's trips on today's service day (for building runs).
import { getSession, json } from "@/lib/authServer";
import { serviceBase, serviceDateForTrip } from "@/lib/adherence";
import { blockScheduleById, blockTripIds } from "@/lib/blocks";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  const block = String(new URL(req.url).searchParams.get("block") || "").trim().slice(0, 40);
  const ids = blockTripIds(block);
  if (!ids.length) return json({ error: `Block ${block} isn't in the schedule.` }, 404);
  const asked = new URL(req.url).searchParams.get("date");
  const date = asked && /^\d{8}$/.test(asked) ? asked : serviceDateForTrip(ids[0], Math.floor(Date.now() / 1000));
  const sched = blockScheduleById(block, date);
  if (!sched?.trips?.length) return json({ error: `Block ${block} doesn't run on that day.` }, 404);
  const base = serviceBase(date);
  const trips = (sched?.trips || []).map(({ trip, route, variant, headsign, dir, start, end }) => ({ trip, route, variant, headsign, dir, start, end, startSecs: start - base }));
  return json({ block, date, trips });
}
