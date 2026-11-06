// Operator roster (names + operator IDs) and each operator's weekly schedule of runs.
// Only accounts with roster access (granted in the admin panel) and the admin can use it.
// Cleared when a new MBTA schedule season arrives (see lib/season.js).
import { dbConfigured, k, redis } from "@/lib/db";
import { getUser } from "@/lib/users";
import { ensureSeason } from "@/lib/season";
import { runDay } from "@/lib/runs";

export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_NAMES = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
export const OPERATOR_ID_RE = /^[A-Z0-9-]{1,12}$/;
const ROSTER = () => k("roster"), SCHED = () => k("opsched");

/** Signed-in session has roster access? (admin login, or an approved account granted it) */
export async function canUseRoster(s) {
  if (!s) return false;
  if (s.role === "admin") return true;
  const u = await getUser(s.id).catch(() => null);
  return !!u && u.status === "approved" && u.roster === "1";
}

function parse(flat) {
  const m = {};
  for (let i = 0; i < (flat || []).length; i += 2) { try { m[flat[i]] = JSON.parse(flat[i + 1]); } catch {} }
  return m;
}

export async function readRoster() {
  if (!dbConfigured()) return { operators: {}, schedules: {} };
  await ensureSeason().catch(() => {});
  const [r, s] = await Promise.all([redis("HGETALL", ROSTER()), redis("HGETALL", SCHED())]);
  return { operators: parse(r), schedules: parse(s) };
}

export async function saveOperator(op) {
  await redis("HSET", ROSTER(), op.operatorId, JSON.stringify(op));
  cache.at = 0;
}
export async function deleteOperator(id) {
  await redis("HDEL", ROSTER(), id);
  await redis("HDEL", SCHED(), id);
  cache.at = 0;
}
export async function saveSchedule(id, days, by) {
  await redis("HSET", SCHED(), id, JSON.stringify({ days, ...by }));
  cache.at = 0;
}

/** Weekday key (sun..sat) of today's service day. */
export function todayKey() {
  const d = runDay();
  return DAYS[new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8))).getUTCDay()];
}

let cache = { at: 0, day: "", map: {} };
/** Today's run assignments: run id -> { operatorId, name } (cached 10 s per server). */
export async function todaysAssignments() {
  if (!dbConfigured()) return {};
  const day = todayKey();
  if (cache.day === day && Date.now() - cache.at < 10000) return cache.map;
  const { operators, schedules } = await readRoster();
  const map = {};
  for (const [id, s] of Object.entries(schedules)) {
    const run = s?.days?.[day];
    if (run && operators[id]) map[run] = { operatorId: id, name: operators[id].name || "" };
  }
  cache = { at: Date.now(), day, map };
  return map;
}
