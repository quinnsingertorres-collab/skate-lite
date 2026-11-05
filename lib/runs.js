// Runs and operators. The MBTA's public data has blocks but no runs or operators, so:
//  - Run definitions are made by users from the public schedule: "run 126-1411 is block C01-31
//    from its 7:20 AM trip through its 11:30 AM trip". Saved permanently; whichever bus works
//    those trips shows that run, every day the block runs.
//  - Operator IDs are entered per bus for the current service day; anyone signed in can edit.
import { dbConfigured, k, redis } from "@/lib/db";
import { load, todayServiceDate } from "@/lib/adherence";

export const RUN_RE = /^[A-Z0-9][A-Z0-9 -]{0,15}$/;
export const OPERATOR_RE = /^[A-Z0-9-]{1,12}$/;
const DEFS = () => k("rundefs"); // hash: "<block>|<startSecs>" -> JSON
const OPS_TTL = 36 * 3600;

/** Service day for operator entries: Boston date, rolling over at 3 AM. */
export function runDay(nowSec = Math.floor(Date.now() / 1000)) {
  return todayServiceDate(nowSec - 3 * 3600);
}
const opsKey = (day = runDay()) => k(`ops:${day}`);

/** Seconds-of-service-day a trip starts at (from the GTFS index), or null. */
export function tripStartSecs(tripId) {
  const t = load()?.trips?.[tripId];
  return t ? t[1][0] : null;
}
/** Block ID and start/end seconds for a trip, from the GTFS index. */
export function tripInfo(tripId) {
  const idx = load();
  const t = idx?.trips?.[tripId];
  if (!t) return null;
  return { block: t[5] >= 0 ? idx.strs[t[5]] : null, start: t[1][0], end: t[1][t[1].length - 1] };
}

function hashToMap(flat) {
  const map = {};
  for (let i = 0; i < (flat || []).length; i += 2) {
    try { map[flat[i]] = JSON.parse(flat[i + 1]); } catch {}
  }
  return map;
}

let defsCache = { at: 0, list: [] };
/** All run definitions (cached 10 s per server). */
export async function runDefs() {
  if (!dbConfigured()) return [];
  if (Date.now() - defsCache.at < 10000) return defsCache.list;
  const list = Object.values(hashToMap(await redis("HGETALL", DEFS()).catch(() => null)));
  defsCache = { at: Date.now(), list };
  return list;
}

/** The run covering a trip of a block, given the trip's start time (seconds of service day). */
export function runFor(defs, block, startSecs) {
  if (!block || startSecs == null) return null;
  return defs.find((d) => d.block === block && startSecs >= d.startSecs && startSecs <= d.endSecs) || null;
}

export async function saveRunDef(def) {
  await redis("HSET", DEFS(), `${def.block}|${def.startSecs}`, JSON.stringify(def));
  defsCache.at = 0;
}
export async function deleteRunDef(block, startSecs) {
  await redis("HDEL", DEFS(), `${block}|${startSecs}`);
  defsCache.at = 0;
}

let opsCache = { at: 0, day: "", map: {} };
/** Today's operator entries, keyed by bus number (cached 5 s per server). */
export async function todaysOperators() {
  if (!dbConfigured()) return {};
  const day = runDay();
  if (opsCache.day === day && Date.now() - opsCache.at < 5000) return opsCache.map;
  const map = hashToMap(await redis("HGETALL", opsKey(day)).catch(() => null));
  opsCache = { at: Date.now(), day, map };
  return map;
}
export async function setOperator(vehicle, entry) {
  const key = opsKey();
  if (entry) {
    await redis("HSET", key, vehicle, JSON.stringify(entry));
    await redis("EXPIRE", key, OPS_TTL);
  } else await redis("HDEL", key, vehicle);
  opsCache.at = 0;
}
