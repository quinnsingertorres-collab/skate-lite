// Server-side schedule adherence from MBTA's public GTFS, used when Swiftly isn't available.
// Positive adherence = late (Skate's convention).
import fs from "node:fs";
import path from "node:path";

let index = null;
export function load() {
  if (index !== null) return index;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data-gen", "schedule.json"), "utf8");
    index = JSON.parse(raw);
  } catch {
    index = false; // build step didn't produce it; adherence just stays unavailable
  }
  return index;
}

// GTFS times count from "noon minus 12h" on the service date, in Boston time.
const offsetCache = new Map();
export function serviceBase(yyyymmdd) {
  if (offsetCache.has(yyyymmdd)) return offsetCache.get(yyyymmdd);
  const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(noonUtc))
    .find((p) => p.type === "timeZoneName")?.value || "GMT-5";
  const hours = Number(name.replace("GMT", "") || 0);
  const noonLocal = noonUtc - hours * 3600e3;
  const base = Math.round((noonLocal - 12 * 3600e3) / 1000);
  offsetCache.set(yyyymmdd, base);
  return base;
}

function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

export function todayServiceDate(nowSec) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(nowSec * 1000));
  return parts.replace(/-/g, "");
}

/**
 * Which service day a trip is running on right now. Trips after midnight belong to the
 * previous day's schedule (GTFS times past 24:00), so try today and yesterday and pick the
 * one that runs on that date and whose times are closest to now.
 */
export function serviceDateForTrip(tripId, nowSec, hint = null) {
  if (hint && /^\d{8}$/.test(hint)) return hint;
  const idx = load();
  const today = todayServiceDate(nowSec);
  const t = idx?.trips?.[tripId];
  if (!t) return today;
  const yesterday = todayServiceDate(nowSec - 86400);
  const svc = t[6];
  const dates = svc >= 0 ? idx.services?.[idx.strs[svc]] : null;
  const secs = t[1];
  let best = today, bestD = Infinity;
  for (const d of [today, yesterday]) {
    if (dates && !dates.includes(d)) continue;
    const base = serviceBase(d);
    const start = base + secs[0], end = base + secs[secs.length - 1];
    const dist = nowSec < start ? start - nowSec : nowSec > end ? nowSec - end : 0;
    if (dist < bestD) { bestD = dist; best = d; }
  }
  return best;
}

/**
 * For a vehicle (from the public feed), returns
 *   { adherence, sched: { a, b, f } }
 * adherence: seconds late (+) / early (-), or null
 * sched: where the trip is scheduled to be right now, as a fraction between timepoints a→b
 */
export function scheduleInfo(v, raw, nowSec) {
  const idx = load();
  if (!idx || !v.trip) return null;
  const t = idx.trips[v.trip];
  if (!t) return null;
  const [seqs, secs, cps, patI, headI, blockI] = t;
  const date = serviceDateForTrip(v.trip, nowSec, raw?.trip?.start_date);
  const base = serviceBase(date);
  const out = {
    adherence: null,
    sched: null,
    pattern: patI >= 0 ? idx.strs[patI] : null,
    headsign: headI >= 0 ? idx.strs[headI] : null,
    block: blockI >= 0 ? idx.strs[blockI] : null,
  };

  // Adherence: compare the bus's progress (in stop sequence) with its scheduled time there.
  const seq = v.seq;
  if (seq != null && v.ts) {
    const progress = v.status === "STOPPED_AT" ? seq : seq - 0.5;
    if (progress > seqs[0] && progress <= seqs[seqs.length - 1]) {
      const scheduledAt = base + interp(seqs, secs, progress);
      const adh = Math.round(v.ts - scheduledAt);
      if (Math.abs(adh) < 3 * 3600) out.adherence = adh;
    }
  }

  // Scheduled position now, expressed between the two surrounding timepoints
  const tNow = nowSec - base;
  if (tNow >= secs[0] - 600 && tNow <= secs[secs.length - 1] + 600) {
    const schedSeq = interp(secs, seqs, Math.min(Math.max(tNow, secs[0]), secs[secs.length - 1]));
    const tp = [];
    for (let i = 0; i < seqs.length; i++) if (cps[i] >= 0) tp.push([seqs[i], idx.cps[cps[i]]]);
    if (tp.length >= 2) {
      let k = tp.findIndex(([s]) => s >= schedSeq);
      if (k <= 0) k = k === 0 ? 1 : tp.length - 1;
      const [sa, a] = tp[k - 1], [sb, b] = tp[k];
      const f = Math.min(1, Math.max(0, (schedSeq - sa) / (sb - sa || 1)));
      out.sched = { a, b, f: Math.round(f * 1000) / 1000 };
    }
  }
  return out;
}
