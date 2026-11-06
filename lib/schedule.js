// Looking up blocks and runs from the public schedule, with or without a live bus on them.
import { firstIndexedDate, lastIndexedDate, load, serviceBase, serviceDateForTrip } from "@/lib/adherence";
import { allBlocks, blockScheduleById } from "@/lib/blocks";
import { expandRun, pieces, runDefs, runFor, runDay } from "@/lib/runs";

/** Today's service date (rolls over at 3 AM, like the runs). */
export const scheduleDay = () => runDay();

/** Dates you can look up: the range the build's schedule calendar covers. */
export function lookupRange() {
  const idx = load();
  return { first: firstIndexedDate(idx), last: lastIndexedDate(idx), today: scheduleDay() };
}
/** A requested date if it's inside the schedule's range, else null (or today when none asked). */
export function pickDate(date) {
  if (!date) return scheduleDay();
  if (!/^\d{8}$/.test(date)) return null;
  const { first, last } = lookupRange();
  return date >= first && date <= last ? date : null;
}

function blockRunsToday(block, date) {
  const idx = load();
  const ids = allBlocks().get(block) || [];
  return ids.some((id) => {
    const svc = idx.trips[id][6];
    const dates = svc >= 0 ? idx.services?.[idx.strs[svc]] : null;
    return !dates || dates.includes(date);
  });
}

function routesOf(trips) {
  return [...new Set(trips.map((t) => t.route).filter(Boolean))];
}

/** Blocks and runs matching a search (block ID, run number, or a route's blocks today). */
export async function searchSchedule(q, { routeIds = [], date: forDate } = {}) {
  const query = String(q || "").trim().toUpperCase();
  if (query.length < 2 && !routeIds.length) return { blocks: [], runs: [] };
  const date = forDate || scheduleDay();
  const blocks = [];
  for (const block of allBlocks().keys()) {
    if (blocks.length >= 30) break;
    const id = block.toUpperCase();
    if (routeIds.length ? !id.startsWith(query) : !id.includes(query)) continue; // a route number lists that route's blocks instead
    if (!blockRunsToday(block, date)) continue;
    blocks.push(block);
  }
  // A route number: every block that works that route today
  const byRoute = [];
  if (routeIds.length) {
    const idx = load();
    for (const [block, ids] of allBlocks()) {
      if (byRoute.length >= 60) break;
      if (!blockRunsToday(block, date)) continue;
      if (ids.some((id) => { const p = idx.trips[id][3]; const pat = p >= 0 ? idx.strs[p] : ""; return routeIds.some((r) => pat.startsWith(`${r}-`)); })) byRoute.push(block);
    }
  }
  const summarize = (block) => {
    const s = blockScheduleById(block, date);
    const trips = s?.trips || [];
    return trips.length ? { block, routes: routesOf(trips), start: trips[0].start, end: trips[trips.length - 1].end, trips: trips.length } : null;
  };
  const blockList = [...new Set([...byRoute, ...blocks])].map(summarize).filter(Boolean).sort((a, b) => a.start - b.start).slice(0, 60);
  const runs = (await runDefs().catch(() => []))
    .filter((d) => query.length >= 2 && d.run.toUpperCase().includes(query))
    .slice(0, 30)
    .map((d) => ({ id: d.id, run: d.run, blocks: [...new Set(pieces(d).map((p) => p.block))] }));
  return { date, blocks: blockList, runs };
}

/** The trip that should be running now (or the next one, or the last one) out of a list. */
function scheduledNow(trips, nowSec) {
  // In progress, or (between trips) the next one. Before the first trip or after the last: none.
  if (!trips.length || nowSec < trips[0].start || nowSec > trips[trips.length - 1].end) return null;
  return trips.find((t) => nowSec >= t.start && nowSec <= t.end) || trips.find((t) => t.start > nowSec) || null;
}

/** A block's full schedule for today, in the shape the Block tab uses. */
export async function blockLookup(block, forDate = null) {
  const ids = allBlocks().get(block) || [];
  if (!ids.length) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const date = forDate || serviceDateForTrip(ids[0], nowSec);
  const sched = blockScheduleById(block, date);
  if (!sched?.trips?.length) return null;
  const base = serviceBase(date);
  const defs = await runDefs().catch(() => []);
  const trips = sched.trips.map((t) => {
    const d = runFor(defs, block, t.start - base, t.trip);
    return { ...t, startSecs: t.start - base, ...(d ? { run: d.run, runId: d.id } : {}) };
  });
  const blockRuns = defs.filter((d) => trips.some((t) => t.runId === d.id)).map((d) => {
    const ps = pieces(d).filter((p) => p.block === block);
    return { id: d.id, run: d.run, startSecs: Math.min(...ps.map((p) => p.startSecs)), endSecs: Math.max(...ps.map((p) => p.endSecs)) };
  });
  const cur = date === scheduleDay() ? scheduledNow(trips, nowSec) : null; // only "now" on today's schedule
  return { kind: "block", date, base, block, trips, blockRuns, trip: cur?.trip || null, predictions: [] };
}

/** A run laid out for today, in the shape the Run tab uses. */
export async function runLookup(id, forDate = null) {
  const def = (await runDefs().catch(() => [])).find((d) => d.id === id);
  if (!def) return null;
  const date = forDate || scheduleDay();
  const base = serviceBase(date);
  const run = expandRun(def, date);
  const trips = run.items.filter((x) => x.type === "trip");
  const cur = date === scheduleDay() ? scheduledNow(trips, Math.floor(Date.now() / 1000)) : null;
  const first = pieces(def)[0];
  return { kind: "run", date, base, block: first?.block || null, run, runDef: def, trip: cur?.trip || null, trips: [] };
}
