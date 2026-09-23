"use client";
import { useEffect, useRef } from "react";
import { OCCUPANCY, STATUS, stopName } from "@/lib/ladder";

function MiniMap({ route, vehicle }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map.current);
      }
      layer.current?.remove();
      layer.current = L.layerGroup().addTo(map.current);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5b2bc4";
      for (const p of Object.values(route?.patterns || {})) {
        if (p.shape?.length) L.polyline(p.shape, { color: accent, weight: 3, opacity: 0.45 }).addTo(layer.current);
      }
      L.circleMarker([vehicle.lat, vehicle.lon], { radius: 9, color: "#fff", weight: 2, fillColor: accent, fillOpacity: 1 })
        .bindTooltip(vehicle.label, { permanent: true, direction: "top", offset: [0, -8] })
        .addTo(layer.current);
      map.current.setView([vehicle.lat, vehicle.lon], 15);
    });
    return () => { cancelled = true; };
  }, [route, vehicle.lat, vehicle.lon, vehicle.label]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return <div ref={el} className="minimap" />;
}

export default function VehiclePanel({ vehicle, route, now, onClose }) {
  const dir = route?.dirs?.[String(vehicle.dir)];
  const stop = stopName(route, vehicle.stop) || vehicle.stop || "—";
  const age = vehicle.ts ? Math.max(0, now - vehicle.ts) : null;
  return (
    <aside className="drawer" aria-label={`Bus ${vehicle.label}`}>
      <div className="drawer-head">
        <div className="big">{vehicle.label}</div>
        <div>
          <div className="meta">{dir ? dir.name.toUpperCase() : ""}</div>
          <div style={{ fontWeight: 600, fontSize: 18 }}>
            {route ? `${route.name}` : vehicle.route ? `Route ${vehicle.route}` : "Not on a route"}
            {dir ? ` · ${dir.dest}` : ""}
          </div>
          {age != null && <div className="meta">updated {age}s ago</div>}
        </div>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <dl className="kv">
        <dt>Vehicle</dt><dd>{vehicle.label}</dd>
        <dt>{STATUS[vehicle.status] || "Stop"}</dt><dd>{stop}</dd>
        <dt>Crowding</dt><dd>{OCCUPANCY[vehicle.occupancy] || "Not available"}</dd>
        <dt>Trip</dt><dd>{vehicle.trip || "—"}{vehicle.revenue ? "" : " (non-revenue)"}</dd>
        <dt>Operator</dt><dd className="meta">Not in public data</dd>
      </dl>
      <MiniMap route={route} vehicle={vehicle} />
    </aside>
  );
}
