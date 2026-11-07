// "Ghost" buses (as in Skate): a block that should be in service right now by the public
// schedule but has no live bus on it. Shown at its scheduled position on the ladder and as a
// "missing logon" in Late View. Also works out where each block's trips end (for Pull-B labels).
import { load, lastIndexedDate, serviceBase, todayServiceDate } from "@/lib/adherence";

let dayCache = new Map(); // date -> Map(block -> [{ id, secs... }] sorted)
function blocksOn(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const idx = load();
  const out = new Map();
  if (!idx) return out;
  const known = date <= lastIndexedDate(idx);
  for (const [id, t] of Object.entries(idx.trips)) {
    if (t[5] < 0) continue;
    const svc = t[6];
    const dates = svc >= 0 ? idx.services?.[idx.strs[svc]] : null;
    if (known && dates && !dates.includes(date)) continue;
    const block = idx.strs[t[5]];
    if (!out.has(block)) out.set(block, []);
    out.get(block).push({ id, t });
  }
  for (const list of out.values()) list.sort((a, b) => a.t[1][0] - b.t[1][0]);
  if (dayCache.size > 4) dayCache = new Map();
  dayCache.set(date, out);
  return out;
}

/** Timepoint position {a, b, f} of a trip at time-of-day tNow (seconds), like the ladder uses. */
function positionAt(idx, t, tNow) {
  const [seqs, secs, cps] = t;
  const tp = [];
  for (let i = 0; i < seqs.length; i++) if (cps[i] >= 0) tp.push([secs[i], idx.cps[cps[i]]]);
  if (tp.length < 2) return null;
  if (tNow <= tp[0][0]) return { a: tp[0][1], b: tp[1][1], f: 0 };
  for (let k = 1; k < tp.length; k++) {
    if (tNow <= tp[k][0]) return { a: tp[k - 1][1], b: tp[k][1], f: Math.round(((tNow - tp[k - 1][0]) / (tp[k][0] - tp[k - 1][0] || 1)) * 1000) / 1000 };
  }
  return { a: tp[tp.length - 2][1], b: tp[tp.length - 1][1], f: 1 };
}

/** Is this the last trip of its block on that date? (the bus pulls back to the garage after it) */
export function isLastTripOfBlock(block, tripId, date) {
  const list = blocksOn(date).get(block);
  return !!list?.length && list[list.length - 1].id === tripId;
}
/** Trip IDs of a block on a date, in order. */
export function blockTripsOn(block, date) {
  return (blocksOn(date).get(block) || []).map((x) => x.id);
}

/**
 * Ghosts for blocks without a live bus. A block counts once its first trip has started (minus a
 * minute) until its last trip ends. Between trips it's laying over at the next trip's start.
 */
export function ghostsNow(liveBlocks, nowSec = Math.floor(Date.now() / 1000)) {
  const idx = load();
  if (!idx) return [];
  const out = [];
  const seen = new Set();
  // Today's and yesterday's service days (trips after midnight belong to yesterday's)
  for (const date of [todayServiceDate(nowSec), todayServiceDate(nowSec - 86400)]) {
    const base = serviceBase(date);
    const tNow = nowSec - base;
    for (const [block, list] of blocksOn(date)) {
      if (seen.has(block) || liveBlocks.has(block)) continue;
      const first = list[0].t[1], last = list[list.length - 1].t[1];
      if (tNow < first[0] - 60 || tNow > last[last.length - 1]) continue;
      let cur = list.find((x) => tNow >= x.t[1][0] && tNow <= x.t[1][x.t[1].length - 1]);
      let layingOver = false;
      if (!cur) { cur = list.find((x) => x.t[1][0] > tNow); layingOver = true; }
      if (!cur) continue;
      const t = cur.t;
      const pat = t[3] >= 0 ? idx.strs[t[3]] : "";
      const m = /^(.*)-(.)-(\d)$/.exec(pat);
      if (!m) continue;
      seen.add(block);
      out.push({
        id: `ghost-${block}`,
        ghost: true,
        block,
        trip: cur.id,
        route: m[1],
        variant: m[2],
        dir: Number(m[3]),
        pattern: pat,
        headsign: t[4] >= 0 ? idx.strs[t[4]] : null,
        status: layingOver ? "laying_over" : "on_route",
        sched: layingOver ? null : positionAt(idx, t, tNow),
        scheduledLogon: base + first[0],
        tripStart: base + t[1][0],
        date,
      });
    }
  }
  return out;
}
