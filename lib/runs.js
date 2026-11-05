// Runs published by signed-in users ("bus 1407 is on run 126-1411"), since the MBTA's public
// data has no run or operator info. One hash per service day: field = bus number, value = JSON.
import { dbConfigured, k, redis } from "@/lib/db";
import { todayServiceDate } from "@/lib/adherence";

const TTL = 36 * 3600; // a service day plus slack
export const RUN_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,15}$/;
export const OPERATOR_RE = /^[A-Za-z0-9-]{1,12}$/;

/** Service day for published runs: Boston date, rolling over at 3 AM (so late-night runs stay put). */
export function runDay(nowSec = Math.floor(Date.now() / 1000)) {
  return todayServiceDate(nowSec - 3 * 3600);
}
const dayKey = (day = runDay()) => k(`runs:${day}`);

let cache = { at: 0, day: "", map: {} };
/** All of today's published runs, keyed by bus number. Shared for 5 s per server. */
export async function todaysRuns() {
  if (!dbConfigured()) return {};
  const day = runDay();
  if (cache.day === day && Date.now() - cache.at < 5000) return cache.map;
  const flat = (await redis("HGETALL", dayKey(day)).catch(() => null)) || [];
  const map = {};
  for (let i = 0; i < flat.length; i += 2) {
    try { map[flat[i]] = JSON.parse(flat[i + 1]); } catch {}
  }
  cache = { at: Date.now(), day, map };
  return map;
}

export async function publishRun(vehicle, entry) {
  const key = dayKey();
  await redis("HSET", key, vehicle, JSON.stringify(entry));
  await redis("EXPIRE", key, TTL);
  cache.at = 0;
}

export async function clearRun(vehicle) {
  await redis("HDEL", dayKey(), vehicle);
  cache.at = 0;
}
