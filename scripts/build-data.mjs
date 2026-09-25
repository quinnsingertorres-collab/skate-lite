// Build-time step: turns MBTA's public GTFS into small JSON files for the ladders.
// Output: public/data/routes.json and public/data/r/<route_id>.json
import { unzipSync, strFromU8 } from "fflate";
import fs from "node:fs";
import path from "node:path";

const GTFS_URL = process.env.GTFS_URL || "https://cdn.mbta.com/MBTA_GTFS.zip";
const OUT = path.join(process.cwd(), "public", "data");
const CACHE = path.join(process.cwd(), ".gtfs-cache", "MBTA_GTFS.zip");
const BUS_KINDS = new Set(["Local Bus", "Frequent Bus", "Commuter Bus", "Coverage Bus", "Supplemental Bus"]);

function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function* rows(text) {
  const lines = text.split(/\r?\n/);
  const header = parseLine(lines[0].replace(/^﻿/, ""));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const v = parseLine(lines[i]);
    const o = {};
    for (let j = 0; j < header.length; j++) o[header[j]] = v[j] ?? "";
    yield o;
  }
}

async function loadZip() {
  if (process.env.USE_GTFS_CACHE && fs.existsSync(CACHE)) return fs.readFileSync(CACHE);
  console.log(`[data] downloading ${GTFS_URL}`);
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, buf);
  return buf;
}

const round = (n) => Math.round(n * 1e5) / 1e5;

async function main() {
  const want = ["routes.txt", "route_patterns.txt", "directions.txt", "stops.txt", "checkpoints.txt", "trips.txt", "stop_times.txt", "shapes.txt", "calendar.txt", "calendar_dates.txt"];
  const files = unzipSync(new Uint8Array(await loadZip()), { filter: (f) => want.includes(f.name) });
  const txt = (n) => strFromU8(files[n]);

  // Routes
  const routes = [];
  for (const r of rows(txt("routes.txt"))) {
    if (r.route_type !== "3" || !BUS_KINDS.has(r.route_desc)) continue;
    routes.push({ id: r.route_id, name: r.route_short_name || r.route_long_name, long: r.route_long_name, kind: r.route_desc, sort: Number(r.route_sort_order) || 0, dirs: {} });
  }
  const routeById = new Map(routes.map((r) => [r.id, r]));
  for (const d of rows(txt("directions.txt"))) {
    const r = routeById.get(d.route_id);
    if (r) r.dirs[d.direction_id] = { name: d.direction, dest: d.direction_destination };
  }

  // All route patterns (main, school/early-morning variants, "via" deviations), like Skate.
  // Main pattern per route+direction: typicality 1, lowest sort order.
  const MAX_TYP = 4; // 1 typical … 3 deviations (e.g. school trips), 4 diversions
  const patternsByRoute = new Map();
  const best = new Map();
  for (const p of rows(txt("route_patterns.txt"))) {
    if (!routeById.has(p.route_id)) continue;
    const typ = Number(p.route_pattern_typicality) || 9;
    if (typ > MAX_TYP) continue;
    const sort = Number(p.route_pattern_sort_order) || 0;
    const m = /-(.)-(\d)$/.exec(p.route_pattern_id);
    const pat = {
      id: p.route_pattern_id, dir: p.direction_id, typ, sort, trip: p.representative_trip_id,
      variant: m ? m[1] : "_", name: p.route_pattern_name, desc: p.route_pattern_time_desc || "",
    };
    if (!patternsByRoute.has(p.route_id)) patternsByRoute.set(p.route_id, []);
    patternsByRoute.get(p.route_id).push(pat);
    const key = `${p.route_id}|${p.direction_id}`;
    const cur = best.get(key);
    if (!cur || typ < cur.typ || (typ === cur.typ && sort < cur.sort)) best.set(key, pat);
  }
  const repTrips = new Map();
  for (const list of patternsByRoute.values()) for (const p of list) repTrips.set(p.trip, p.id);

  // Services running in the next SCHEDULE_DAYS days (for the adherence index)
  const DAYS = Number(process.env.SCHEDULE_DAYS || 45);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const windowDates = [];
  for (let i = -1; i <= DAYS; i++) windowDates.push(new Date(Date.now() + i * 864e5));
  const activeServices = new Set();
  const dowKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const c of rows(txt("calendar.txt"))) {
    for (const d of windowDates) {
      const k = ymd(d);
      if (k >= c.start_date && k <= c.end_date && c[dowKeys[d.getUTCDay()]] === "1") { activeServices.add(c.service_id); break; }
    }
  }
  const windowSet = new Set(windowDates.map(ymd));
  // Exact dates each service runs in the window (for "which trips does this block run today")
  const serviceDates = new Map();
  const addDate = (sid, d) => { if (!serviceDates.has(sid)) serviceDates.set(sid, new Set()); serviceDates.get(sid).add(d); };
  for (const c of rows(txt("calendar.txt"))) {
    for (const d of windowDates) {
      const k = ymd(d);
      if (k >= c.start_date && k <= c.end_date && c[dowKeys[d.getUTCDay()]] === "1") addDate(c.service_id, k);
    }
  }
  for (const c of rows(txt("calendar_dates.txt"))) {
    if (!windowSet.has(c.date)) continue;
    if (c.exception_type === "1") { activeServices.add(c.service_id); addDate(c.service_id, c.date); }
    if (c.exception_type === "2") serviceDates.get(c.service_id)?.delete(c.date);
  }

  const shapeByTrip = new Map();
  const schedTrips = new Map(); // trip_id -> { pattern, headsign }, for bus trips in the window
  for (const t of rows(txt("trips.txt"))) {
    if (repTrips.has(t.trip_id)) shapeByTrip.set(t.trip_id, t.shape_id);
    if (routeById.has(t.route_id) && activeServices.has(t.service_id)) schedTrips.set(t.trip_id, { pattern: t.route_pattern_id, headsign: t.trip_headsign, block: t.block_id, service: t.service_id, route: t.route_id, dir: t.direction_id });
  }

  // Stop times for representative trips only (stop_times.txt is ~150MB, so scan lines cheaply)
  const st = txt("stop_times.txt");
  const stHeader = parseLine(st.slice(0, st.indexOf("\n")).replace(/\r|﻿/g, ""));
  const iTrip = stHeader.indexOf("trip_id"), iStop = stHeader.indexOf("stop_id"), iSeq = stHeader.indexOf("stop_sequence"), iCp = stHeader.indexOf("checkpoint_id");
  const iArr = stHeader.indexOf("arrival_time"), iDep = stHeader.indexOf("departure_time");
  const toSecs = (t) => { const [h, m, x] = t.split(":").map(Number); return h * 3600 + m * 60 + (x || 0); };
  const stopsByTrip = new Map();
  const sched = new Map(); // trip_id -> [[seq, secs, cp], ...] (timepoints + first/last stop)
  const busStopIds = new Set();
  let pos = st.indexOf("\n") + 1;
  while (pos < st.length) {
    let end = st.indexOf("\n", pos);
    if (end === -1) end = st.length;
    const comma = st.indexOf(",", pos);
    const tripId = st.slice(pos, comma).replace(/"/g, "");
    const isRep = repTrips.has(tripId), isSched = schedTrips.has(tripId);
    if (isRep || isSched) {
      const v = parseLine(st.slice(pos, end).replace(/\r$/, ""));
      if (isRep) {
        if (!stopsByTrip.has(tripId)) stopsByTrip.set(tripId, []);
        stopsByTrip.get(tripId).push({ stop: v[iStop], seq: Number(v[iSeq]), cp: v[iCp] || "" });
      }
      if (isSched) {
        if (!sched.has(tripId)) sched.set(tripId, []);
        sched.get(tripId).push([Number(v[iSeq]), toSecs(v[iDep] || v[iArr]), v[iCp] || ""]);
        busStopIds.add(v[iStop]);
      }
    }
    pos = end + 1;
  }
  void iTrip;

  const neededShapes = new Set(shapeByTrip.values());
  const shapes = new Map();
  for (const s of rows(txt("shapes.txt"))) {
    if (!neededShapes.has(s.shape_id)) continue;
    if (!shapes.has(s.shape_id)) shapes.set(s.shape_id, []);
    shapes.get(s.shape_id).push([Number(s.shape_pt_sequence), round(+s.shape_pt_lat), round(+s.shape_pt_lon)]);
  }

  const stops = new Map();
  for (const s of rows(txt("stops.txt"))) stops.set(s.stop_id, { name: s.stop_name, lat: round(+s.stop_lat), lon: round(+s.stop_lon) });
  const cpNames = new Map();
  for (const c of rows(txt("checkpoints.txt"))) cpNames.set(c.checkpoint_id, c.checkpoint_name);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "r"), { recursive: true });

  // Merge ordered lists (each in direction-0 order) into one ladder order, keeping every list's order.
  const mergeOrder = (lists) => {
    const out = [];
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        if (out.includes(x)) continue;
        const prev = list.slice(0, i).reverse().find((t) => out.includes(t));
        if (prev != null) { out.splice(out.indexOf(prev) + 1, 0, x); continue; }
        const next = list.slice(i + 1).find((t) => out.includes(t));
        if (next != null) out.splice(out.indexOf(next), 0, x);
        else out.push(x);
      }
    }
    return out;
  };

  const index = [];
  for (const r of routes) {
    const pats = (patternsByRoute.get(r.id) || []).filter((p) => stopsByTrip.has(p.trip));
    if (!pats.length) continue;
    pats.sort((a, b) => a.typ - b.typ || a.sort - b.sort);
    const patterns = {};
    for (const p of pats) {
      const list = stopsByTrip.get(p.trip).sort((a, c) => a.seq - c.seq);
      const shape = (shapes.get(shapeByTrip.get(p.trip)) || []).sort((a, c) => a[0] - c[0]);
      const maxPts = p.typ === 1 ? 400 : 250;
      const step = Math.max(1, Math.floor(shape.length / maxPts));
      patterns[p.id] = {
        dir: Number(p.dir), variant: p.variant, name: p.name, desc: p.desc, typ: p.typ,
        stops: list.map((x) => {
          const s = stops.get(x.stop) || {};
          return { id: x.stop, name: s.name || x.stop, lat: s.lat, lon: s.lon, tp: x.cp || undefined };
        }),
        shape: shape.filter((_, i) => i % step === 0 || i === shape.length - 1).map((q) => [q[1], q[2]]),
      };
    }
    const main = {};
    for (const d of ["0", "1"]) { const b = best.get(`${r.id}|${d}`); if (b && patterns[b.id]) main[d] = b.id; }

    // Ladder timepoints: every pattern's timepoints merged (main patterns first), like Skate
    const tpList = (p) => {
      const ids = patterns[p.id].stops.map((s) => s.tp).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
      return p.dir === "0" ? ids : ids.reverse();
    };
    const ladder = mergeOrder(pats.filter((p) => p.typ <= 3).map(tpList));
    const timepoints = ladder.map((id) => ({ id, name: cpNames.get(id) || id }));
    fs.writeFileSync(path.join(OUT, "r", `${r.id}.json`), JSON.stringify({ id: r.id, name: r.name, long: r.long, dirs: r.dirs, timepoints, main, patterns }));
    index.push({ id: r.id, name: r.name, long: r.long, kind: r.kind, sort: r.sort, dirs: r.dirs });
  }
  index.sort((a, b) => a.sort - b.sort);
  const feedVersion = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "routes.json"), JSON.stringify({ built: feedVersion, routes: index }));

  // Server-side schedule index for adherence: keep timepoints plus each trip's first and last stop.
  const cpIds = [], cpIdx = new Map();
  const cpi = (c) => { if (!c) return -1; if (!cpIdx.has(c)) { cpIdx.set(c, cpIds.length); cpIds.push(c); } return cpIdx.get(c); };
  const strIds = [], strIdx = new Map();
  const si = (x) => { if (!x) return -1; if (!strIdx.has(x)) { strIdx.set(x, strIds.length); strIds.push(x); } return strIdx.get(x); };
  const trips = {};
  for (const [tripId, list] of sched) {
    list.sort((a, b) => a[0] - b[0]);
    const keep = list.filter((x, i) => x[2] || i === 0 || i === list.length - 1);
    const info = schedTrips.get(tripId) || {};
    trips[tripId] = [keep.map((x) => x[0]), keep.map((x) => x[1]), keep.map((x) => cpi(x[2])), si(info.pattern), si(info.headsign), si(info.block), si(info.service)];
  }
  const GEN = path.join(process.cwd(), "data-gen");
  fs.mkdirSync(GEN, { recursive: true });
  fs.writeFileSync(path.join(GEN, "schedule.json"), JSON.stringify({
    built: feedVersion,
    cps: cpIds,
    cpNames: cpIds.map((c) => cpNames.get(c) || c),
    strs: strIds,
    services: Object.fromEntries([...serviceDates].filter(([sid]) => strIdx.has(sid)).map(([sid, ds]) => [sid, [...ds].sort()])),
    stopNames: Object.fromEntries([...busStopIds].map((id) => [id, stops.get(id)?.name || id])),
    trips,
  }));
  console.log(`[data] wrote schedule index for ${sched.size} bus trips (${DAYS} days)`);
  console.log(`[data] wrote ${index.length} routes to public/data`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
