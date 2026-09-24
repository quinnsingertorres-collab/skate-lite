"use client";
import { useEffect, useRef } from "react";
import { OCCUPANCY, STATUS, adherenceLabel, onTime, stopName } from "@/lib/ladder";
import { VehicleBadge } from "@/components/VehicleGlyph";
import { CloseIcon } from "@/components/Icons";

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
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
      }
      layer.current?.remove();
      layer.current = L.layerGroup().addTo(map.current);
      for (const p of Object.values(route?.patterns || {})) {
        if (p.shape?.length) L.polyline(p.shape, { color: "#7c47ae", weight: 4, opacity: 0.55 }).addTo(layer.current);
      }
      L.circleMarker([vehicle.lat, vehicle.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#7c47ae", fillOpacity: 1 })
        .bindTooltip(String(vehicle.label), { permanent: true, direction: "top", offset: [0, -8] })
        .addTo(layer.current);
      map.current.setView([vehicle.lat, vehicle.lon], 15);
    });
    return () => { cancelled = true; };
  }, [route, vehicle.lat, vehicle.lon, vehicle.label]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return <div ref={el} className="pp-map" />;
}

export default function VehiclePanel({ vehicle, route, now, onClose }) {
  const dir = route?.dirs?.[String(vehicle.dir)];
  const stop = vehicle.nextStopName || stopName(route, vehicle.stop) || vehicle.stop || "Not available";
  const age = vehicle.ts ? Math.max(0, now - vehicle.ts) : null;
  const adh = adherenceLabel(vehicle.adherence);
  const status = onTime(vehicle.adherence);
  const headsign = vehicle.headsign || dir?.dest || (vehicle.route ? "" : "Not on a route");

  return (
    <aside className="pp" aria-label={`Vehicle ${vehicle.label}`}>
      <div className="pp-header">
        <div className="pp-icon">
          <VehicleBadge vehicle={vehicle} size="large" />
        </div>
        <div className="pp-summary">
          {dir && <div className="pp-direction">{dir.name}</div>}
          <div className="pp-route">
            {route && <span className="route-pill">{route.name}</span>}
            <span>{headsign}</span>
          </div>
          <div className="pp-adherence">
            {adh ? (
              <>
                <i className={`dot ${status}`} />
                <span className={status}>{status === "ontime" ? "On time" : status === "early" ? "Early" : "Late"}</span>
                <span className="pp-adherence-detail">({adh.toLowerCase()})</span>
              </>
            ) : (
              <span className="muted">Schedule adherence not available</span>
            )}
          </div>
        </div>
        <div className="pp-meta">
          <button className="pp-close" onClick={onClose} aria-label="Close vehicle details">
            <CloseIcon size={14} />
          </button>
          {age != null && <div className="pp-age">{age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`}</div>}
        </div>
      </div>

      <div className="pp-tabs" role="tablist">
        <span className="pp-tab is-active" role="tab" aria-selected="true">Status</span>
      </div>

      <div className="pp-body">
        <dl className="pp-props">
          <dt>Run</dt><dd>{vehicle.run || <span className="muted">Not available</span>}</dd>
          <dt>Vehicle</dt><dd>{vehicle.label}</dd>
          <dt>Block</dt><dd>{vehicle.block || <span className="muted">Not available</span>}</dd>
          <dt>Operator</dt><dd><span className="muted">Not available</span></dd>
          <dt>Trip</dt><dd>{vehicle.trip || "—"}{vehicle.revenue === false ? " (non-revenue)" : ""}</dd>
          <dt>Crowding</dt><dd>{OCCUPANCY[vehicle.occupancy] || <span className="muted">Not available</span>}</dd>
        </dl>

        <div className="pp-section">
          <div className="pp-label">{STATUS[vehicle.status] || "Next stop"}</div>
          <div className="pp-value">{stop}</div>
        </div>

        <MiniMap route={route} vehicle={vehicle} />
      </div>
    </aside>
  );
}
