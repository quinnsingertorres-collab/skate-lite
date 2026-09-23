// Live bus positions: MBTA's public enhanced feed, optionally merged with Swiftly.
// Swiftly adds schedule adherence (early/late), headsign, run and block. The API key
// stays on the server (SWIFTLY_API_KEY); responses are cached 10s at the edge, so
// Swiftly is called at most about once per 10s no matter how many people are viewing.
const MBTA_FEED = process.env.VEHICLES_URL || "https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json";
const SWIFTLY_KEY = process.env.SWIFTLY_API_KEY;
const SWIFTLY_URL =
  process.env.SWIFTLY_VEHICLES_URL ||
  `https://api.goswift.ly/real-time/${process.env.SWIFTLY_AGENCY || "mbta"}/vehicles?unassigned=true&verbose=true`;

export const revalidate = 0;

async function mbtaVehicles() {
  const res = await fetch(MBTA_FEED, { next: { revalidate: 10 } });
  if (!res.ok) throw new Error(`MBTA feed ${res.status}`);
  const feed = await res.json();
  const out = [];
  for (const e of feed.entity || []) {
    const v = e.vehicle;
    if (!v?.position) continue;
    const trip = v.trip || {};
    const route = trip.route_id || null;
    if (route && !/^\d/.test(route)) continue; // skip rail; keep bus + SL (numeric IDs)
    out.push({
      id: v.vehicle?.id || e.id,
      label: v.vehicle?.label || e.id,
      route,
      dir: trip.direction_id ?? null,
      trip: trip.trip_id || null,
      revenue: trip.revenue !== false,
      stop: v.stop_id || null,
      seq: v.current_stop_sequence ?? null,
      status: v.current_status || null,
      lat: v.position.latitude,
      lon: v.position.longitude,
      bearing: v.position.bearing ?? null,
      occupancy: v.occupancy_status || null,
      ts: v.timestamp || null,
      sources: ["mbta"],
    });
  }
  return out;
}

async function swiftlyVehicles() {
  if (!SWIFTLY_KEY) return { status: "off", vehicles: [] };
  const res = await fetch(SWIFTLY_URL, {
    headers: { Authorization: SWIFTLY_KEY, Accept: "application/json" },
    next: { revalidate: 10 },
  });
  if (!res.ok) return { status: `error ${res.status}`, vehicles: [] };
  const body = await res.json();
  return { status: "ok", vehicles: body?.data?.vehicles || [] };
}

export async function GET() {
  const [mbta, swiftly] = await Promise.allSettled([mbtaVehicles(), swiftlyVehicles()]);
  const base = mbta.status === "fulfilled" ? mbta.value : [];
  const sw = swiftly.status === "fulfilled" ? swiftly.value : { status: `error ${swiftly.reason}`, vehicles: [] };

  const byId = new Map(base.map((v) => [v.id, v]));
  for (const s of sw.vehicles) {
    if (!s?.id) continue;
    const loc = s.loc || {};
    const extra = {
      adherence: typeof s.schAdhSecs === "number" ? s.schAdhSecs : null,
      headsign: s.headsign || null,
      run: s.runId || null,
      block: s.blockId || null,
      nextStopName: s.nextStopName || null,
    };
    const v = byId.get(s.id);
    if (v) {
      Object.assign(v, extra);
      v.sources.push("swiftly");
      if (loc.time && (!v.ts || loc.time > v.ts)) {
        v.lat = loc.lat ?? v.lat;
        v.lon = loc.lon ?? v.lon;
        v.ts = loc.time;
      }
    } else if (loc.lat != null && s.routeId && /^\d/.test(s.routeId)) {
      byId.set(s.id, {
        id: s.id,
        label: String(s.id).replace(/^y/, ""),
        route: s.routeId,
        dir: s.directionId != null ? Number(s.directionId) : null,
        trip: s.tripId || null,
        revenue: true,
        stop: s.nextStopId || null,
        seq: null,
        status: "IN_TRANSIT_TO",
        lat: loc.lat,
        lon: loc.lon,
        bearing: loc.heading ?? null,
        occupancy: null,
        ts: loc.time || null,
        sources: ["swiftly"],
        ...extra,
      });
    }
  }

  const vehicles = [...byId.values()];
  const error = mbta.status === "rejected" && !sw.vehicles.length ? String(mbta.reason) : null;
  return Response.json(
    {
      fetched: Math.floor(Date.now() / 1000),
      sources: { mbta: mbta.status === "fulfilled" ? "ok" : "error", swiftly: sw.status },
      error,
      vehicles,
    },
    {
      status: error ? 502 : 200,
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    }
  );
}
