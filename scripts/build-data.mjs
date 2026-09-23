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
  const want = ["routes.txt", "route_patterns.txt", "directions.txt", "stops.txt", "checkpoints.txt", "trips.txt", "stop_times.txt", "shapes.txt"];
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

  // Main pattern per route+direction: typicality 1, lowest sort order
  const best = new Map();
  for (const p of rows(txt("route_patterns.txt"))) {
    if (!routeById.has(p.route_id)) continue;
    const key = `${p.route_id}|${p.direction_id}`;
    const typ = Number(p.route_pattern_typicality) || 9;
    const sort = Number(p.route_pattern_sort_order) || 0;
    const cur = best.get(key);
    if (!cur || typ < cur.typ || (typ === cur.typ && sort < cur.sort)) best.set(key, { typ, sort, trip: p.representative_trip_id, pattern: p.route_pattern_id });
  }
  const repTrips = new Map([...best].map(([k, v]) => [v.trip, k]));

  const shapeByTrip = new Map();
  for (const t of rows(txt("trips.txt"))) if (repTrips.has(t.trip_id)) shapeByTrip.set(t.trip_id, t.shape_id);

  // Stop times for representative trips only (stop_times.txt is ~150MB, so scan lines cheaply)
  const st = txt("stop_times.txt");
  const stHeader = parseLine(st.slice(0, st.indexOf("\n")).replace(/\r|﻿/g, ""));
  const iTrip = stHeader.indexOf("trip_id"), iStop = stHeader.indexOf("stop_id"), iSeq = stHeader.indexOf("stop_sequence"), iCp = stHeader.indexOf("checkpoint_id");
  const stopsByTrip = new Map();
  let pos = st.indexOf("\n") + 1;
  while (pos < st.length) {
    let end = st.indexOf("\n", pos);
    if (end === -1) end = st.length;
    const comma = st.indexOf(",", pos);
    const tripId = st.slice(pos, comma).replace(/"/g, "");
    if (repTrips.has(tripId)) {
      const v = parseLine(st.slice(pos, end).replace(/\r$/, ""));
      if (!stopsByTrip.has(tripId)) stopsByTrip.set(tripId, []);
      stopsByTrip.get(tripId).push({ stop: v[iStop], seq: Number(v[iSeq]), cp: v[iCp] || "" });
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

  const index = [];
  for (const r of routes) {
    const dirs = {};
    for (const dir of ["0", "1"]) {
      const b = best.get(`${r.id}|${dir}`);
      const list = b && stopsByTrip.get(b.trip);
      if (!list) continue;
      list.sort((a, c) => a.seq - c.seq);
      const shape = (shapes.get(shapeByTrip.get(b.trip)) || []).sort((a, c) => a[0] - c[0]);
      const step = Math.max(1, Math.floor(shape.length / 400));
      dirs[dir] = {
        pattern: b.pattern,
        stops: list.map((x) => {
          const s = stops.get(x.stop) || {};
          return { id: x.stop, name: s.name || x.stop, lat: s.lat, lon: s.lon, tp: x.cp || undefined };
        }),
        shape: shape.filter((_, i) => i % step === 0 || i === shape.length - 1).map((p) => [p[1], p[2]]),
      };
    }
    if (!dirs["0"] && !dirs["1"]) continue;

    // Ladder timepoints: direction 0 order, then any direction-1-only timepoints slotted in
    const tpOrder = (d) => (dirs[d]?.stops || []).map((s) => s.tp).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const t0 = tpOrder("0");
    const t1 = tpOrder("1").reverse();
    const ladder = t0.length ? [...t0] : [...t1];
    if (t0.length) {
      for (let i = 0; i < t1.length; i++) {
        if (ladder.includes(t1[i])) continue;
        const prev = t1.slice(0, i).reverse().find((t) => ladder.includes(t));
        ladder.splice(prev ? ladder.indexOf(prev) + 1 : 0, 0, t1[i]);
      }
    }
    const timepoints = ladder.map((id) => ({ id, name: cpNames.get(id) || id }));
    fs.writeFileSync(path.join(OUT, "r", `${r.id}.json`), JSON.stringify({ id: r.id, name: r.name, long: r.long, dirs: r.dirs, timepoints, patterns: dirs }));
    index.push({ id: r.id, name: r.name, long: r.long, kind: r.kind, sort: r.sort, dirs: r.dirs });
  }
  index.sort((a, b) => a.sort - b.sort);
  const feedVersion = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "routes.json"), JSON.stringify({ built: feedVersion, routes: index }));
  console.log(`[data] wrote ${index.length} routes to public/data`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
