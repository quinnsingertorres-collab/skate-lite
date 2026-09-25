// Block schedules and live stop predictions, server-side.
import { load, serviceBase } from "@/lib/adherence";

const TRIP_UPDATES = process.env.TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates_enhanced.json";

let blockIndex = null; // block_id -> [trip_id]
function blocks(idx) {
  if (blockIndex) return blockIndex;
  blockIndex = new Map();
  for (const [tripId, t] of Object.entries(idx.trips)) {
    const bi = t[5];
    if (bi == null || bi < 0) continue;
    const b = idx.strs[bi];
    if (!blockIndex.has(b)) blockIndex.set(b, []);
    blockIndex.get(b).push(tripId);
  }
  return blockIndex;
}

function tripSummary(idx, tripId, base) {
  const t = idx.trips[tripId];
  if (!t) return null;
  const [seqs, secs, cps, patI, headI] = t;
  const pattern = patI >= 0 ? idx.strs[patI] : null;
  const m = pattern ? /^(.*)-(.)-(\d)$/.exec(pattern) : null;
  return {
    trip: tripId,
    pattern,
    route: m ? m[1] : null,
    variant: m ? m[2] : null,
    dir: m ? Number(m[3]) : null,
    headsign: headI >= 0 ? idx.strs[headI] : null,
    start: base + secs[0],
    end: base + secs[secs.length - 1],
    timepoints: seqs
      .map((seq, i) => (cps[i] >= 0 ? { seq, cp: idx.cps[cps[i]], name: idx.cpNames?.[cps[i]] || idx.cps[cps[i]], time: base + secs[i] } : null))
      .filter(Boolean),
  };
}

/** All trips in the bus's block on its service date, in order. */
export function blockSchedule(tripId, date) {
  const idx = load();
  if (!idx) return null;
  const t = idx.trips[tripId];
  if (!t) return null;
  const block = t[5] >= 0 ? idx.strs[t[5]] : null;
  const base = serviceBase(date);
  if (!block) return { block: null, trips: [tripSummary(idx, tripId, base)] };
  const runsOn = (id) => {
    const svc = idx.trips[id][6];
    const dates = svc >= 0 ? idx.services?.[idx.strs[svc]] : null;
    return !dates || dates.includes(date);
  };
  const trips = (blocks(idx).get(block) || [])
    .filter((id) => id === tripId || runsOn(id))
    .map((id) => tripSummary(idx, id, base))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  return { block, trips };
}

export function stopName(stopId) {
  const idx = load();
  return (idx && idx.stopNames?.[stopId]) || null;
}

/** Live predicted times for one trip's remaining stops. */
export async function tripPredictions(tripId) {
  try {
    const res = await fetch(TRIP_UPDATES, { next: { revalidate: 10 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const feed = await res.json();
    const e = (feed.entity || []).find((x) => x.trip_update?.trip?.trip_id === tripId);
    if (!e) return [];
    return (e.trip_update.stop_time_update || [])
      .map((u) => ({
        stop: u.stop_id,
        seq: u.stop_sequence,
        time: u.arrival?.time || u.departure?.time || null,
        skipped: u.schedule_relationship === "SKIPPED",
      }))
      .filter((u) => u.time || u.skipped);
  } catch {
    return [];
  }
}
