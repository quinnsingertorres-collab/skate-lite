// Live bus positions: MBTA's public enhanced feed, optionally merged with Swiftly.
// Swiftly adds schedule adherence (early/late), headsign, run and block. The API key
// stays on the server (SWIFTLY_API_KEY). Feeds are always fetched fresh (shared for a few
// seconds per server) so buses are shown where they are now.
const MBTA_FEED = process.env.VEHICLES_URL || "https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json";
import { scheduleInfo } from "@/lib/adherence";
import { lookupTrips } from "@/lib/mbtaTrips";
import { pieces, runDefs, runFor, todaysOperators, tripStartSecs } from "@/lib/runs";
import { ghostsNow, isLastTripOfBlock } from "@/lib/ghosts";
import { serviceDateForTrip } from "@/lib/adherence";
import { canUseRoster, readRoster, todaysAssignments } from "@/lib/roster";
import { getSession } from "@/lib/authServer";
import { liveJson } from "@/lib/liveFetch";
import { AGENCY, SWIFTLY_KEY, swiftlyVehicles } from "@/lib/swiftly";

export const revalidate = 0;
export const dynamic = "force-dynamic";
const MAX_AGE_S = 10 * 60; // hide buses whose last GPS report is older than this
export const runtime = "nodejs";

async function mbtaVehicles() {
  const res = await liveJson(MBTA_FEED);
  if (!res.ok || !res.body) throw new Error(`MBTA feed ${res.status}`);
  const feed = res.body;
  const nowS = Math.floor(Date.now() / 1000);
  const out = [];
  for (const e of feed.entity || []) {
    const v = e.vehicle;
    if (!v?.position) continue;
    if (v.timestamp && nowS - v.timestamp > MAX_AGE_S) continue; // stale GPS: not where the bus is now
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

export async function GET(req) {
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
      if (!rest.block && info.block) rest.block = info.block;
    }
    return rest;
  });

  // Trips missing from the schedule index: ask the MBTA V3 API (batched, cached)
  const needBlock = vehicles.filter((v) => !v.block && v.trip);
  if (needBlock.length) {
    const found = await lookupTrips([...new Set(needBlock.map((v) => v.trip))]);
    for (const v of needBlock) {
      const t = found.get(v.trip);
      if (!t) continue;
      if (t.block) v.block = t.block;
      if (!v.headsign && t.headsign) v.headsign = t.headsign;
      if (!v.pattern && t.pattern) {
        v.pattern = t.pattern;
        const m = /-(.)-\d$/.exec(t.pattern);
        v.variant = m ? m[1] : "_";
      }
    }
  }
  // Runs (user-made from the public schedule; Swiftly's run, when present, wins) and today's operators
  const [defs, ops, assigned, session] = await Promise.all([
    runDefs().catch(() => []), todaysOperators().catch(() => ({})), todaysAssignments().catch(() => ({})), getSession(req).catch(() => null),
  ]);
  const showNames = await canUseRoster(session).catch(() => false); // operator names only for roster access
  const rosterOps = showNames ? (await readRoster().catch(() => ({ operators: {} }))).operators : {};
  const rosterName = (id) => rosterOps[id]?.name || "";
  for (const v of vehicles) {
    const d = runFor(defs, v.block, tripStartSecs(v.trip), v.trip);
    // End of this trip, for Skate-style labels: Pull-B (pulls back to the garage after) or
    // Sw-Off (the run ends here and another operator takes the bus)
    if (v.block && v.trip) {
      const date = serviceDateForTrip(v.trip, nowSec);
      if (isLastTripOfBlock(v.block, v.trip, date)) v.endOfTrip = "pull_back";
      else if (d) {
        const piece = pieces(d).find((p) => p.tripIds?.includes(v.trip));
        if (piece && piece.tripIds[piece.tripIds.length - 1] === v.trip) v.endOfTrip = "swing_off";
      }
    }
    if (d) {
      if (!v.run) { v.run = d.run; v.runSource = "schedule"; }
      v.runDef = { id: d.id, run: d.run };
    }
    const o = ops[v.label];
    const a = d ? assigned[d.id] : null;
    if (o) v.operatorInfo = { operatorId: o.operatorId, byName: o.byName || "", at: o.at };
    else if (a) v.operatorInfo = { operatorId: a.operatorId, source: "schedule" };
    const nameFor = v.operatorInfo && showNames ? (assigned[d?.id]?.operatorId === v.operatorInfo.operatorId ? assigned[d.id].name : rosterName(v.operatorInfo.operatorId)) : "";
    if (nameFor) v.operatorInfo.name = nameFor;
  }

  // Ghosts: blocks scheduled to be running with no live bus on them (only when the feed is healthy)
  const liveBlocks = new Set(vehicles.map((v) => v.block).filter(Boolean));
  const ghosts = mbta.status === "fulfilled" && vehicles.length > 20 ? ghostsNow(liveBlocks, nowSec).map((g) => {
    const d = runFor(defs, g.block, tripStartSecs(g.trip), g.trip);
    const a = d ? assigned[d.id] : null;
    return { ...g, ...(d ? { run: d.run, runDef: { id: d.id, run: d.run } } : {}), ...(a ? { operatorInfo: { operatorId: a.operatorId, source: "schedule", ...(showNames ? { name: a.name } : {}) } } : {}) };
  }) : [];

  const error = mbta.status === "rejected" && !sw.vehicles.length ? String(mbta.reason) : null;
  return Response.json(
    {
      fetched: Math.floor(Date.now() / 1000),
      sources: {
        mbta: mbta.status === "fulfilled" ? "ok" : "error",
        swiftly: sw.status,
        ...(sw.detail ? { swiftlyDetail: sw.detail } : {}),
        ...(SWIFTLY_KEY ? { swiftlyAgency: process.env.SWIFTLY_VEHICLES_URL ? "custom URL" : AGENCY } : {}),
      },
      error,
      vehicles,
      ghosts,
    },
    {
      status: error ? 502 : 200,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
