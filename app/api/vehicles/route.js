// Live bus positions: MBTA's public enhanced feed, optionally merged with Swiftly.
// Swiftly adds schedule adherence (early/late), headsign, run and block. The API key
// stays on the server (SWIFTLY_API_KEY); responses are cached 10s at the edge, so
// Swiftly is called at most about once per 10s no matter how many people are viewing.
const MBTA_FEED = process.env.VEHICLES_URL || "https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json";
// Tolerate common paste mistakes: surrounding quotes/whitespace/newlines, or a copied "Authorization:"/"Bearer" prefix
const SWIFTLY_KEY = (process.env.SWIFTLY_API_KEY || "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/^authorization:\s*/i, "")
  .replace(/^bearer\s+/i, "")
  .trim();
const SWIFTLY_URL =
  process.env.SWIFTLY_VEHICLES_URL ||
  `https://api.goswift.ly/real-time/${process.env.SWIFTLY_AGENCY || "mbta"}/vehicles?unassigned=true&verbose=true`;

import { scheduleInfo } from "@/lib/adherence";

export const revalidate = 0;
export const runtime = "nodejs";

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
      occupancyPct: typeof v.occupancy_percentage === "number" ? v.occupancy_percentage : null,
      ts: v.timestamp || null,
      sources: ["mbta"],
      _raw: v,
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
  if (!res.ok) {
    let detail = "";
    try {
      const b = await res.json();
      detail = b?.errorMessage || b?.message || "";
    } catch {}
    const hint =
      res.status === 401 ? "check SWIFTLY_API_KEY (and that it is enabled for this environment)" :
      res.status === 403 ? "key is not allowed for this agency; check SWIFTLY_AGENCY" :
      res.status === 404 ? "agency not found; check SWIFTLY_AGENCY / SWIFTLY_VEHICLES_URL" :
      res.status === 429 ? "rate limited by Swiftly" : "";
    return { status: `error ${res.status}`, detail: [detail, hint].filter(Boolean).join(" – "), vehicles: [] };
  }
  const body = await res.json();
  return { status: "ok", vehicles: body?.data?.vehicles || [] };
}

export async function GET() {
  const [mbta, swiftly] = await Promise.allSettled([mbtaVehicles(), swiftlyVehicles()]);
  const base = mbta.status === "fulfilled" ? mbta.value : [];
  const sw = swiftly.status === "fulfilled" ? swiftly.value : { status: "error", detail: String(swiftly.reason), vehicles: [] };

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

  // Schedule adherence + scheduled position from GTFS (Swiftly's adherence wins when present)
  const nowSec = Math.floor(Date.now() / 1000);
  const vehicles = [...byId.values()].map((v) => {
    const info = scheduleInfo(v, v._raw, nowSec);
    const { _raw, ...rest } = v;
    if (info) {
      if (rest.adherence == null && info.adherence != null) {
        rest.adherence = info.adherence;
        rest.adherenceSource = "schedule";
      } else if (rest.adherence != null) rest.adherenceSource = "swiftly";
      if (info.sched) rest.sched = info.sched;
      if (info.pattern) {
        rest.pattern = info.pattern;
        const m = /-(.)-\d$/.exec(info.pattern);
        rest.variant = m ? m[1] : "_";
      }
      if (!rest.headsign && info.headsign) rest.headsign = info.headsign;
    }
    return rest;
  });
  const error = mbta.status === "rejected" && !sw.vehicles.length ? String(mbta.reason) : null;
  return Response.json(
    {
      fetched: Math.floor(Date.now() / 1000),
      sources: {
        mbta: mbta.status === "fulfilled" ? "ok" : "error",
        swiftly: sw.status,
        ...(sw.detail ? { swiftlyDetail: sw.detail } : {}),
        ...(SWIFTLY_KEY ? { swiftlyAgency: process.env.SWIFTLY_VEHICLES_URL ? "custom URL" : process.env.SWIFTLY_AGENCY || "mbta" } : {}),
      },
      error,
      vehicles,
    },
    {
      status: error ? 502 : 200,
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" },
    }
  );
}
