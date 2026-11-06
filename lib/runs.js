// Runs and operators. The MBTA's public data has blocks but no runs or operators, so users
// build runs from the public schedule, Skate-style: pieces of trips (from one or more blocks)
// plus activities such as report time, pull out/back, breaks, deadheads and done. Saved
// permanently; whichever bus works a run's trips shows that run, every day the blocks run.
// Operator IDs are entered per bus for the current service day; anyone signed in can edit.
import crypto from "node:crypto";
import { dbConfigured, k, redis } from "@/lib/db";
import { load, serviceBase, todayServiceDate } from "@/lib/adherence";
import { blockScheduleById, blockTripIds } from "@/lib/blocks";

export const RUN_RE = /^[A-Z0-9][A-Z0-9 -]{0,15}$/;
export const OPERATOR_RE = /^[A-Z0-9-]{1,12}$/;
export const ACTIVITIES = {
  report: "Report time",
  pullout: "Pull out",
  pullback: "Pull back",
  deadhead: "Deadhead",
  break: "Break",
  done: "Done",
};
const DEFS = () => k("rundefs"); // hash: id -> JSON run definition
const OPS_TTL = 36 * 3600;
const MAX_SECS = 36 * 3600;

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

function hashToMap(flat) {
  const map = {};
  for (let i = 0; i < (flat || []).length; i += 2) {
    try { map[flat[i]] = JSON.parse(flat[i + 1]); } catch {}
  }
  return map;
}

// Older saved runs were a single stretch of one block: { run, block, startSecs, endSecs }
function normalize(id, d) {
  if (Array.isArray(d.items)) return { ...d, id };
  return { id, run: d.run, by: d.by, byName: d.byName, at: d.at, items: [{ type: "trips", block: d.block, startSecs: d.startSecs, endSecs: d.endSecs }] };
}
export const pieces = (def) => (def.items || []).filter((x) => x.type === "trips");

let defsCache = { at: 0, list: [] };
/** All run definitions (cached 10 s per server). */
export async function runDefs() {
  if (!dbConfigured()) return [];
  if (Date.now() - defsCache.at < 10000) return defsCache.list;
  const map = hashToMap(await redis("HGETALL", DEFS()).catch(() => null));
  const list = Object.entries(map).map(([id, d]) => normalize(id, d));
  defsCache = { at: Date.now(), list };
  return list;
}

/** The run covering a trip of a block, given the trip's start time (seconds of service day). */
export function runFor(defs, block, startSecs) {
  if (!block || startSecs == null) return null;
  return defs.find((d) => pieces(d).some((p) => p.block === block && startSecs >= p.startSecs && startSecs <= p.endSecs)) || null;
}

export async function saveRunDef(def) {
  if (!def.id) def.id = crypto.randomBytes(6).toString("hex");
  await redis("HSET", DEFS(), def.id, JSON.stringify(def));
  defsCache.at = 0;
  return def;
}
export async function deleteRunDef(id) {
  await redis("HDEL", DEFS(), id);
  defsCache.at = 0;
}

/** Checks and tidies a run definition sent by a user. Returns { def } or { error }. */
export function validateRun(body, others) {
  const run = String(body.run || "").trim().toUpperCase();
  if (!RUN_RE.test(run)) return { error: "Enter a run number (letters, numbers and dashes, up to 16)." };
  if (!Array.isArray(body.items) || !body.items.length) return { error: "Add at least one piece of trips." };
  if (body.items.length > 60) return { error: "That run has too many items." };
  const items = [];
  for (const x of body.items) {
    if (x?.type === "trips") {
      const block = String(x.block || "").trim();
      const startSecs = Number(x.startSecs), endSecs = Number(x.endSecs);
      if (!blockTripIds(block).length) return { error: `Block ${block || "?"} isn't in the schedule.` };
      if (!Number.isFinite(startSecs) || !Number.isFinite(endSecs) || endSecs < startSecs) return { error: "A trips piece has its first and last trip the wrong way round." };
      items.push({ type: "trips", block, startSecs, endSecs });
    } else if (ACTIVITIES[x?.type]) {
      const secs = Number(x.secs);
      if (!Number.isFinite(secs) || secs < 0 || secs > MAX_SECS) return { error: `${ACTIVITIES[x.type]} needs a time.` };
      const it = { type: x.type, secs: Math.round(secs), place: String(x.place || "").trim().slice(0, 50) };
      if (x.type === "break") {
        const mins = Math.round(Number(x.mins));
        if (!(mins >= 1 && mins <= 600)) return { error: "A break needs a length in minutes." };
        it.mins = mins; it.paid = !!x.paid;
      }
      items.push(it);
    } else return { error: "Unknown item in the run." };
  }
  if (!items.some((x) => x.type === "trips")) return { error: "Add at least one piece of trips." };
  // Trip pieces can't overlap each other or another run's
  const mine = items.filter((x) => x.type === "trips");
  for (const p of mine) {
    for (const q of mine) if (q !== p && q.block === p.block && p.startSecs <= q.endSecs && p.endSecs >= q.startSecs) return { error: `Two pieces of block ${p.block} overlap.` };
    for (const o of others) for (const q of pieces(o)) {
      if (q.block === p.block && p.startSecs <= q.endSecs && p.endSecs >= q.startSecs) return { error: `Those trips on block ${p.block} are already in run ${o.run}. Change that run first.` };
    }
  }
  return { def: { run, items } };
}

const timeOf = (x) => (x.type === "trips" ? x.startSecs : x.secs);

/**
 * A run laid out for one service date: each trips piece becomes its trips (with timepoints),
 * activities get absolute times. Sorted by time.
 */
export function expandRun(def, date) {
  const base = serviceBase(date);
  const out = [];
  for (const x of [...def.items].sort((a, b) => timeOf(a) - timeOf(b))) {
    if (x.type === "trips") {
      const sched = blockScheduleById(x.block, date);
      const trips = (sched?.trips || []).filter((t) => t.start - base >= x.startSecs && t.start - base <= x.endSecs);
      for (const t of trips) out.push({ type: "trip", block: x.block, ...t });
    } else {
      out.push({ ...x, time: base + x.secs, ...(x.type === "break" ? { end: base + x.secs + x.mins * 60 } : {}) });
    }
  }
  out.sort((a, b) => (a.type === "trip" ? a.start : a.time) - (b.type === "trip" ? b.start : b.time));
  return { id: def.id, run: def.run, byName: def.byName || "", at: def.at, items: out };
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
