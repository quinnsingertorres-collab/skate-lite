"use client";
import { useEffect, useRef } from "react";
import { OCCUPANCY, STATUS, adherenceLabel, onTime, patternFor, stopName, variantLabel } from "@/lib/ladder";
import { SHAPE_STYLE, TILE_OPTS, TILE_URL, stopMarkerOpts, vehicleMarkerHtml } from "@/lib/mapStyle";
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
        L.tileLayer(TILE_URL, TILE_OPTS).addTo(map.current);
      }
      layer.current?.remove();
      layer.current = L.layerGroup().addTo(map.current);
      const pat = patternFor(route, vehicle);
      if (pat?.shape?.length) L.polyline(pat.shape, SHAPE_STYLE).addTo(layer.current);
      for (const st of pat?.stops || []) {
        if (st.lat != null) L.circleMarker([st.lat, st.lon], stopMarkerOpts()).bindTooltip(st.name, { direction: "top", offset: [0, -6], className: "map-tip" }).addTo(layer.current);
      }
      L.marker([vehicle.lat, vehicle.lon], {
        icon: L.divIcon({ className: "", html: vehicleMarkerHtml(vehicle, { primary: true }), iconSize: [26, 26], iconAnchor: [13, 13] }),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(layer.current);
      map.current.setView([vehicle.lat, vehicle.lon], 15);
    });
    return () => { cancelled = true; };
  }, [route, vehicle.lat, vehicle.lon, vehicle.label, vehicle.bearing, vehicle.adherence, vehicle.pattern]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const pattern = patternFor(route, vehicle);

  return (
    <aside className="pp" aria-label={`Vehicle ${vehicle.label}`}>
      <div className="pp-header">
        <div className="pp-icon">
          <VehicleBadge vehicle={vehicle} size="large" />
        </div>
        <div className="pp-summary">
          {dir && <div className="pp-direction">{dir.name}</div>}
          <div className="pp-route">
            {(route || vehicle.route) && (
              <span className="pp-route-variant">{`${route?.name || vehicle.route}_${variantLabel(vehicle)}`}</span>
            )}
            <span>{headsign}</span>
          </div>
          {pattern && pattern.typ > 1 && (
            <div className="pp-pattern" title={pattern.name}>
              {pattern.desc || "Route variation"} · {pattern.name}
            </div>
          )}
          <div className="pp-adherence">
            {adh ? (
              <>
                <i className={`dot ${status}`} />
                <span className={status}>{status === "ontime" ? "On time" : status === "early" ? "Early" : "Late"}</span>
                <span className="pp-adherence-detail">({adh.toLowerCase()}{vehicle.adherenceSource === "schedule" ? ", from schedule" : ""})</span>
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
