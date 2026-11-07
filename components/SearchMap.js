"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { adherenceLabel, patternFor } from "@/lib/ladder";
import { SHAPE_STYLE_SELECTED, TILE_OPTS, TILE_URL, stopMarker, vehicleMarkerHtml } from "@/lib/mapStyle";
import { VehicleBadge } from "@/components/VehicleGlyph";
import { CloseIcon, LocateIcon, SearchIcon } from "@/components/Icons";

export default function SearchMap({ vehicles, routes, routeData, selectedId, onSelect, onOpenSchedule }) {
  const el = useRef(null);
  const map = useRef(null);
  const Lref = useRef(null);
  const markers = useRef(new Map());
  const shapeLayer = useRef(null);
  const [query, setQuery] = useState("");
  // Recent searches (this device), like Skate
  const RECENT_KEY = "skate-lite:recent-searches";
  const [recent, setRecent] = useState([]);
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch {} }, []);
  const remember = (term) => {
    const t = String(term || "").trim();
    if (!t) return;
    const next = [t, ...recent.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    setRecent(next); try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };
  const [panelOpen, setPanelOpen] = useState(true);
  const [tick, setTick] = useState(0);
  // "Zoom to my location"
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [me, setMe] = useState(null);
  const meLayer = useRef(null);
  const locate = () => {
    if (!navigator.geolocation) { setLocMsg("Location isn't available in this browser."); return; }
    setLocating(true); setLocMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
        setMe(p);
        map.current?.setView([p.lat, p.lon], Math.max(map.current.getZoom(), 16), { animate: true });
      },
      (err) => {
        setLocating(false);
        setLocMsg(err.code === 1 ? "Location permission is off. Allow location for this site in your browser or phone settings." : "Couldn't find your location. Try again.");
        setTimeout(() => setLocMsg(""), 6000);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  };
  useEffect(() => {
    const L = Lref.current;
    if (!L || !map.current || !me) return;
    meLayer.current?.remove();
    meLayer.current = L.layerGroup([
      L.circle([me.lat, me.lon], { radius: Math.min(me.acc || 0, 500), stroke: false, fillColor: "#2f7ef6", fillOpacity: 0.12, interactive: false }),
      L.circleMarker([me.lat, me.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#2f7ef6", fillOpacity: 1, interactive: false }),
    ]).addTo(map.current);
  }, [me, tick]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let dead = false;
    import("leaflet").then(({ default: L }) => {
      if (dead || !el.current || map.current) return;
      Lref.current = L;
      map.current = L.map(el.current, { zoomControl: false }).setView([42.3467, -71.0972], 12);
      L.control.zoom({ position: "topright" }).addTo(map.current);
      L.tileLayer(TILE_URL, TILE_OPTS).addTo(map.current);
      shapeLayer.current = L.layerGroup().addTo(map.current);
      setTick((t) => t + 1);
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
  }, []);

  // Sync markers with live vehicles
  useEffect(() => {
    const L = Lref.current;
    if (!L || !map.current) return;
    const seen = new Set();
    for (const v of vehicles) {
      if (v.lat == null) continue;
      seen.add(v.id);
      const sel = v.id === selectedId;
      const icon = L.divIcon({ className: "", html: vehicleMarkerHtml(v, { selected: sel, primary: sel }), iconSize: [26, 26], iconAnchor: [13, 13] });
      let m = markers.current.get(v.id);
      if (!m) {
        m = L.marker([v.lat, v.lon], { icon, keyboard: false, riseOnHover: true }).addTo(map.current);
        m.on("click", () => onSelectRef.current(markers.current.get(v.id)._v));
        markers.current.set(v.id, m);
      } else {
        m.setLatLng([v.lat, v.lon]);
        m.setIcon(icon);
      }
      m._v = v;
      m.setZIndexOffset(sel ? 1000 : 0);
    }
    for (const [id, m] of markers.current) {
      if (!seen.has(id)) { m.remove(); markers.current.delete(id); }
    }
  }, [vehicles, selectedId, tick]);

  // Show the selected bus's route and centre on it
  const selected = vehicles.find((v) => v.id === selectedId);
  const selRoute = selected?.route ? routeData[selected.route] : null;
  useEffect(() => {
    const L = Lref.current;
    if (!L || !shapeLayer.current) return;
    shapeLayer.current.clearLayers();
    // Like Skate: the selected bus's own route pattern, with its stops
    const pat = selected ? patternFor(selRoute, selected) : null;
    if (pat?.shape?.length) L.polyline(pat.shape, SHAPE_STYLE_SELECTED).addTo(shapeLayer.current);
    for (const st of pat?.stops || []) {
      if (st.lat == null) continue;
      stopMarker(L, st).addTo(shapeLayer.current);
    }
  }, [selRoute, selected?.pattern, selected?.dir, selectedId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected && selected.lat != null && selected.lon != null && map.current) map.current.setView([selected.lat, selected.lon], Math.max(map.current.getZoom(), 15), { animate: true });
  }, [selectedId, tick > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const nameOf = (id) => routes.find((r) => r.id === id)?.name?.toLowerCase() || "";
    return vehicles
      .filter((v) => String(v.label).toLowerCase().startsWith(q) || (v.run && v.run.toLowerCase().includes(q)) || (v.operatorInfo?.operatorId && v.operatorInfo.operatorId.toLowerCase() === q) || (v.block && v.block.toLowerCase().includes(q)) || nameOf(v.route) === q)
      .slice(0, 40);
  }, [q, vehicles, routes]);

  // Blocks and runs from the public schedule (no live bus needed)
  const [sched, setSched] = useState({ q: "", blocks: [], runs: [], loading: false });
  // Which day's schedule to look up ("" = today). Range comes from the server's schedule calendar.
  const [day, setDay] = useState("");
  const [range, setRange] = useState(null);
  useEffect(() => { fetch("/api/schedule?range=1").then((r) => (r.ok ? r.json() : null)).then((d) => d && setRange(d)).catch(() => {}); }, []);
  const ymdToInput = (d) => (d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "");
  const inputToYmd = (v) => v.replace(/-/g, "");
  const shift = (d, n) => { const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + n)); return t.toISOString().slice(0, 10).replace(/-/g, ""); };
  useEffect(() => {
    if (q.length < 2 && !routes.some((r) => r.name.toLowerCase() === q)) { setSched({ q, blocks: [], runs: [], loading: false }); return; }
    let dead = false;
    setSched((s) => ({ ...s, loading: true }));
    const routeIds = routes.filter((r) => r.name.toLowerCase() === q).map((r) => r.id);
    const t = setTimeout(() => {
      fetch(`/api/schedule?q=${encodeURIComponent(q)}${routeIds.length ? `&routes=${routeIds.join(",")}` : ""}${day ? `&date=${day}` : ""}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { blocks: [], runs: [] }))
        .then((d) => { if (!dead) setSched({ q, blocks: d.blocks || [], runs: d.runs || [], loading: false }); })
        .catch(() => { if (!dead) setSched({ q, blocks: [], runs: [], loading: false }); });
    }, 250);
    return () => { dead = true; clearTimeout(t); };
  }, [q, routes, day]);
  const routeName = (id) => routes.find((r) => r.id === id)?.name || id;
  const clock = (t) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <div className="search-map">
      <div className={`search-panel${panelOpen ? "" : " is-collapsed"}`}>
        <label className="search-box">
          <SearchIcon size={16} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPanelOpen(true); }}
            placeholder="Search vehicles, blocks, runs or routes"
            aria-label="Search vehicles, blocks, runs or routes"
          />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search"><CloseIcon size={12} /></button>}
        </label>
        {range && (
          <div className="sched-day" role="group" aria-label="Schedule day for blocks and runs">
            <span>Schedule for</span>
            <button className={!day ? "is-on" : ""} onClick={() => setDay("")}>Today</button>
            <button className={day === shift(range.today, -1) ? "is-on" : ""} onClick={() => setDay(shift(range.today, -1))} disabled={shift(range.today, -1) < range.first}>Yesterday</button>
            <button className={day === shift(range.today, 1) ? "is-on" : ""} onClick={() => setDay(shift(range.today, 1))}>Tomorrow</button>
            <input type="date" value={ymdToInput(day || range.today)} min={ymdToInput(range.first)} max={ymdToInput(range.last)}
              onChange={(e) => { const v = inputToYmd(e.target.value); setDay(v && v !== range.today ? v : ""); }} aria-label="Pick a date" />
          </div>
        )}
        {q && (
          <div className="search-results">
            <div className="search-results-head">Vehicles <span>{results.length}</span></div>
            {results.length === 0 && <p className="search-empty">No live vehicles match “{query}”.</p>}
            <ul>
              {results.map((v) => {
                const r = routes.find((x) => x.id === v.route);
                const adh = adherenceLabel(v.adherence);
                return (
                  <li key={v.id}>
                    <button className={`result-card${v.id === selectedId ? " is-selected" : ""}`} onClick={() => { remember(query); onSelect(v); }}>
                      <VehicleBadge vehicle={v} />
                      <span className="result-main">
                        <span className="result-title">
                          {r && <span className="route-pill">{r.name}</span>}
                          <b>{v.headsign || r?.dirs?.[String(v.dir)]?.dest || "Not on a route"}</b>
                        </span>
                        <span className="result-sub">
                          Vehicle {v.label}
                          {v.block ? ` · Block ${v.block}` : ""}
                          {v.run ? ` · Run ${v.run}` : ""}
                          {adh ? ` · ${adh}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(sched.runs.length > 0 || sched.blocks.length > 0 || sched.loading) && (
              <>
                <div className="search-results-head">Runs &amp; blocks ({day ? new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "today"}'s schedule) <span>{sched.loading ? "…" : sched.runs.length + sched.blocks.length}</span></div>
                <ul>
                  {sched.runs.map((r) => (
                    <li key={`run-${r.id}`}>
                      <button className="result-card result-card--sched" onClick={() => { remember(query); onOpenSchedule?.({ kind: "run", id: r.id, date: day || null }); }}>
                        <span className="sched-tag">Run</span>
                        <span className="result-main">
                          <span className="result-title"><b>Run {r.run}</b></span>
                          <span className="result-sub">Blocks {r.blocks.join(", ")}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {sched.blocks.map((b) => (
                    <li key={`blk-${b.block}`}>
                      <button className="result-card result-card--sched" onClick={() => { remember(query); onOpenSchedule?.({ kind: "block", block: b.block, date: day || null }); }}>
                        <span className="sched-tag">Block</span>
                        <span className="result-main">
                          <span className="result-title">{b.routes.slice(0, 3).map((r) => <span key={r} className="route-pill">{routeName(r)}</span>)}<b>{b.block}</b></span>
                          <span className="result-sub">{clock(b.start)} – {clock(b.end)} · {b.trips} trips{vehicles.some((v) => v.block === b.block) ? " · bus on it now" : ""}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {!q && recent.length > 0 && (
          <div className="recent">
            <div className="recent-head">Recent searches <button onClick={() => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch {} }}>Clear</button></div>
            <div className="recent-list">{recent.map((r) => <button key={r} onClick={() => setQuery(r)}>{r}</button>)}</div>
          </div>
        )}
        {!q && <p className="search-tip">Search by bus number (e.g. 1920), block (e.g. C01-31), run, operator ID or route. Blocks and runs come up from the schedule even with no bus on them.</p>}
      </div>
      <div className="search-map-area">
        <div className="search-map-canvas" ref={el} />
        <button className={`map-locate${locating ? " is-busy" : ""}${me ? " is-on" : ""}`} onClick={locate} aria-label="Zoom to my location" title="Zoom to my location">
          <LocateIcon size={20} />
        </button>
        {locMsg && <div className="map-locate-msg" role="status">{locMsg}</div>}
      </div>
    </div>
  );
}
