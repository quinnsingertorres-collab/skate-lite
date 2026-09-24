"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { adherenceLabel, patternFor } from "@/lib/ladder";
import { SHAPE_STYLE_SELECTED, TILE_OPTS, TILE_URL, stopMarkerOpts, vehicleMarkerHtml } from "@/lib/mapStyle";
import { VehicleBadge } from "@/components/VehicleGlyph";
import { CloseIcon, SearchIcon } from "@/components/Icons";

export default function SearchMap({ vehicles, routes, routeData, selectedId, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const Lref = useRef(null);
  const markers = useRef(new Map());
  const shapeLayer = useRef(null);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [tick, setTick] = useState(0);
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
      L.circleMarker([st.lat, st.lon], stopMarkerOpts())
        .bindTooltip(st.name, { direction: "top", offset: [0, -6], className: "map-tip" })
        .addTo(shapeLayer.current);
    }
  }, [selRoute, selected?.pattern, selected?.dir, selectedId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected && map.current) map.current.setView([selected.lat, selected.lon], Math.max(map.current.getZoom(), 15), { animate: true });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    const nameOf = (id) => routes.find((r) => r.id === id)?.name?.toLowerCase() || "";
    return vehicles
      .filter((v) => String(v.label).toLowerCase().startsWith(q) || (v.run && v.run.toLowerCase().includes(q)) || (v.block && v.block.toLowerCase().includes(q)) || nameOf(v.route) === q)
      .slice(0, 40);
  }, [q, vehicles, routes]);

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
                    <button className={`result-card${v.id === selectedId ? " is-selected" : ""}`} onClick={() => onSelect(v)}>
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
          </div>
        )}
        {!q && <p className="search-tip">Search by bus number (e.g. 1920){vehicles.some((v) => v.run) ? ", run" : ""} or route, or tap a bus on the map.</p>}
      </div>
      <div className="search-map-canvas" ref={el} />
    </div>
  );
}
