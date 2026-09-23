// Place a live vehicle on a route ladder (between timepoints), like Skate does.

function distM(aLat, aLon, bLat, bLon) {
  const k = Math.PI / 180;
  const x = (bLon - aLon) * k * Math.cos(((aLat + bLat) / 2) * k);
  const y = (bLat - aLat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Fractional index of the vehicle along the pattern's stop list, or null if it isn't on the pattern.
function stopProgress(pattern, v) {
  const stops = pattern.stops;
  let idx = v.stop ? stops.findIndex((s) => s.id === v.stop) : -1;
  if (idx === -1) {
    let best = -1, bestD = Infinity;
    stops.forEach((s, i) => {
      if (s.lat == null) return;
      const d = distM(v.lat, v.lon, s.lat, s.lon);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === -1 || bestD > 400) return null;
    return best;
  }
  if (v.status === "STOPPED_AT" || idx === 0) return idx;
  // In transit to stop idx: estimate how far between the previous stop and this one
  const a = stops[idx - 1], b = stops[idx];
  if (a?.lat == null || b?.lat == null) return idx - 0.5;
  const total = distM(a.lat, a.lon, b.lat, b.lon) || 1;
  const done = Math.min(1, Math.max(0, 1 - distM(v.lat, v.lon, b.lat, b.lon) / total));
  return idx - 1 + done;
}

// Returns a position 0..(timepoints.length-1) on the ladder (in timepoint order), or null.
export function ladderPosition(route, v) {
  const pattern = route.patterns[String(v.dir)];
  if (!pattern) return null;
  const f = stopProgress(pattern, v);
  if (f == null) return null;
  const order = new Map(route.timepoints.map((t, i) => [t.id, i]));
  const anchors = [];
  pattern.stops.forEach((s, i) => {
    if (s.tp && order.has(s.tp) && !anchors.some((a) => a.tp === s.tp)) anchors.push({ i, tp: s.tp, pos: order.get(s.tp) });
  });
  if (!anchors.length) return null;
  if (f <= anchors[0].i) return anchors[0].pos;
  for (let k = 0; k < anchors.length - 1; k++) {
    const a = anchors[k], b = anchors[k + 1];
    if (f <= b.i) return a.pos + ((f - a.i) / (b.i - a.i || 1)) * (b.pos - a.pos);
  }
  return anchors[anchors.length - 1].pos;
}

export function stopName(route, stopId) {
  for (const p of Object.values(route?.patterns || {})) {
    const s = p.stops.find((x) => x.id === stopId);
    if (s) return s.name;
  }
  return null;
}

export const OCCUPANCY = {
  EMPTY: "Empty",
  MANY_SEATS_AVAILABLE: "Many seats",
  FEW_SEATS_AVAILABLE: "Few seats",
  STANDING_ROOM_ONLY: "Standing room",
  CRUSHED_STANDING_ROOM_ONLY: "Crowded",
  FULL: "Full",
  NOT_ACCEPTING_PASSENGERS: "Not accepting passengers",
};

export const STATUS = { STOPPED_AT: "Stopped at", IN_TRANSIT_TO: "Heading to", INCOMING_AT: "Arriving at" };

// Skate's convention: positive = late. Early if more than 1 min ahead, late if more than 6 min behind.
export function onTime(adherence) {
  if (adherence == null) return null;
  if (adherence < -60) return "early";
  if (adherence > 360) return "late";
  return "ontime";
}

export function adherenceLabel(adherence) {
  if (adherence == null) return null;
  const min = Math.round(Math.abs(adherence) / 60);
  if (min === 0) return "On time";
  return `${min} min ${adherence < 0 ? "early" : "late"}`;
}
