"use client";
import { useEffect, useRef, useState } from "react";
import { OCCUPANCY, STATUS, adherenceLabel, onTime, patternFor, stopName, variantLabel } from "@/lib/ladder";
import { SHAPE_STYLE, TILE_OPTS, TILE_URL, stopMarker, vehicleMarkerHtml } from "@/lib/mapStyle";
import { VehicleBadge } from "@/components/VehicleGlyph";
import { CloseIcon, DirectionsIcon, LocateIcon } from "@/components/Icons";
import { BlockSchedule, UpcomingStops, useVehicleSchedule } from "@/components/Minischedule";

function distM(aLat, aLon, bLat, bLon) {
  const k = Math.PI / 180;
  const x = (bLon - aLon) * k * Math.cos(((aLat + bLat) / 2) * k);
  const y = (bLat - aLat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Nearest stop on the bus's route, for "Current location"
function nearestStop(pattern, v) {
  let best = null, bestD = Infinity;
  for (const s of pattern?.stops || []) {
    if (s.lat == null) continue;
    const d = distM(v.lat, v.lon, s.lat, s.lon);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best ? { name: best.name, d: bestD } : null;
}

function directionsUrl(v) {
  const apple = typeof navigator !== "undefined" && /iPhone|iPad|Macintosh/.test(navigator.userAgent);
  return apple
    ? `https://maps.apple.com/?daddr=${v.lat},${v.lon}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`;
}

// Crowding level 1-3 from the MBTA occupancy status
const CROWD = {
  EMPTY: [1, "Not crowded"], MANY_SEATS_AVAILABLE: [1, "Not crowded"], FEW_SEATS_AVAILABLE: [2, "Some crowding"],
  STANDING_ROOM_ONLY: [3, "Crowded"], CRUSHED_STANDING_ROOM_ONLY: [3, "Crowded"], FULL: [3, "Full"], NOT_ACCEPTING_PASSENGERS: [3, "Full"],
};

function Riders({ level }) {
  return (
    <svg className={`riders riders--${level}`} width="54" height="34" viewBox="0 0 54 34" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <g key={i} className={i < level ? "on" : ""} transform={`translate(${9 + i * 18},0)`}>
          <circle cx="0" cy="6" r="4.5" />
          <rect x="-6" y="12.5" width="12" height="21" rx="5" />
        </g>
      ))}
    </svg>
  );
}

function MiniMap({ route, vehicle, onOpenMap }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then(({ default: L }) => {
      if (cancelled || !el.current) return;
      const first = !map.current;
      if (first) {
        map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
        L.control.zoom({ position: "topright" }).addTo(map.current);
        L.tileLayer(TILE_URL, TILE_OPTS).addTo(map.current);
      }
      layer.current?.remove();
      layer.current = L.layerGroup().addTo(map.current);
      const pat = patternFor(route, vehicle);
      if (pat?.shape?.length) L.polyline(pat.shape, SHAPE_STYLE).addTo(layer.current);
      for (const st of pat?.stops || []) if (st.lat != null) stopMarker(L, st).addTo(layer.current);
      L.marker([vehicle.lat, vehicle.lon], {
        icon: L.divIcon({ className: "", html: vehicleMarkerHtml(vehicle, { primary: true, selected: true }), iconSize: [26, 26], iconAnchor: [13, 13] }),
        keyboard: false,
        zIndexOffset: 1000,
      }).addTo(layer.current);
      if (first) map.current.setView([vehicle.lat, vehicle.lon], 16);
    });
    return () => { cancelled = true; };
  }, [route, vehicle.lat, vehicle.lon, vehicle.label, vehicle.bearing, vehicle.adherence, vehicle.pattern]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  const recenter = () => map.current?.setView([vehicle.lat, vehicle.lon], Math.max(16, map.current.getZoom()), { animate: true });
  return (
    <div className="pp-map-wrap">
      <div ref={el} className="pp-map" />
      {onOpenMap && <button className="pp-map-open" onClick={onOpenMap}>Open Map</button>}
      <button className="pp-map-recenter" onClick={recenter} aria-label="Center on bus" title="Center on bus">
        <LocateIcon size={20} />
      </button>
    </div>
  );
}

const TABS = [["status", "Status"], ["run", "Run"], ["block", "Block"]];

export default function VehiclePanel({ vehicle, route, now, onClose, onOpenMap }) {
  const dir = route?.dirs?.[String(vehicle.dir)];
  const next = vehicle.nextStopName || stopName(route, vehicle.stop) || vehicle.stop || "Not available";
  const age = vehicle.ts ? Math.max(0, now - vehicle.ts) : null;
  const adh = adherenceLabel(vehicle.adherence);
  const status = onTime(vehicle.adherence);
  const headsign = vehicle.headsign || dir?.dest || (vehicle.route ? "" : "Not on a route");
  const pattern = patternFor(route, vehicle);
  const [tab, setTab] = useState("status");
  const schedule = useVehicleSchedule(vehicle.trip);
  const near = nearestStop(pattern, vehicle);
  const crowd = CROWD[vehicle.occupancy];

  return (
    <aside className="pp" aria-label={`Vehicle ${vehicle.label}`}>
      <div className="pp-bar">
        <span />
        <h2>Vehicles</h2>
        <button className="pp-close" onClick={onClose} aria-label="Close vehicle details">
          <CloseIcon size={22} />
        </button>
      </div>

      <div className="pp-header">
        <div className="pp-icon">
          <VehicleBadge vehicle={vehicle} size="large" />
        </div>
        <div className="pp-summary">
          {dir && <div className="pp-direction">{dir.name}</div>}
          <div className="pp-route">
            {(route || vehicle.route) && <span className="pp-route-variant">{`${route?.name || vehicle.route}_${variantLabel(vehicle)}`}</span>}
            <span>{headsign}</span>
          </div>
          {pattern && pattern.typ > 1 && (
            <div className="pp-pattern" title={pattern.name}>{pattern.desc || "Route variation"} · {pattern.name}</div>
          )}
          <div className="pp-status-row">
            <div className="pp-adherence" title={vehicle.adherenceSource === "schedule" ? "Calculated from the MBTA schedule" : vehicle.adherenceSource === "swiftly" ? "From Swiftly" : undefined}>
              {adh ? (
                <>
                  <i className={`dot ${status}`} />
                  <span className={`pp-adh-word ${status}`}>{status === "ontime" ? "On time" : status === "early" ? "Early" : "Late"}</span>
                  {adh !== "On time" && <span className="pp-adherence-detail">{adh}</span>}
                </>
              ) : (
                <span className="muted">Adherence not available</span>
              )}
            </div>
            {age != null && <div className="pp-age">{age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`}</div>}
          </div>
        </div>
      </div>

      <div className="pp-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} className={`pp-tab${tab === id ? " is-active" : ""}`} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} disabled={id === "block" && !vehicle.trip}>
            <i className="pp-radio" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "block" && (
        <div className="pp-body">
          <BlockSchedule data={schedule} vehicle={vehicle} now={now} upFor={(d) => d === 0} />
        </div>
      )}

      {tab === "run" && (
        <div className="pp-body">
          <dl className="pp-props">
            <dt>Run</dt><dd>{vehicle.run || <span className="muted">Not available</span>}</dd>
            <dt>Vehicle</dt><dd>{vehicle.label}</dd>
            <dt>Block</dt><dd>{vehicle.block || <span className="muted">Not available</span>}</dd>
            <dt>Operator</dt><dd><span className="muted">Not available</span></dd>
            <dt>Trip</dt><dd>{vehicle.trip || "—"}{vehicle.revenue === false ? " (non-revenue)" : ""}</dd>
            <dt>Route pattern</dt><dd>{pattern?.name || <span className="muted">Not available</span>}</dd>
          </dl>
        </div>
      )}

      {tab === "status" && (
        <div className="pp-body">
          <div className="pp-section pp-section--row">
            <div>
              <div className="pp-label">Riders onboard</div>
              <div className="pp-text">
                {vehicle.occupancyPct != null ? `${vehicle.occupancyPct}% full` : OCCUPANCY[vehicle.occupancy] || <span className="muted">Not available</span>}
              </div>
              {crowd && <div className="pp-text pp-caps">{crowd[1]}</div>}
            </div>
            {crowd && <Riders level={crowd[0]} />}
          </div>

          <div className="pp-section">
            <div className="pp-label">Current location</div>
            <div className="pp-text">{near ? (near.d < 40 ? `At ${near.name}` : `Near ${near.name}`) : `${vehicle.lat.toFixed(4)}, ${vehicle.lon.toFixed(4)}`}</div>
            <a className="pp-directions" href={directionsUrl(vehicle)} target="_blank" rel="noreferrer">
              <DirectionsIcon size={16} /> Get directions to bus
            </a>
          </div>

          <div className="pp-section">
            <div className="pp-label">{vehicle.status === "STOPPED_AT" ? STATUS.STOPPED_AT : "Next stop"}</div>
            <div className="pp-text">{next}</div>
          </div>

          <MiniMap route={route} vehicle={vehicle} onOpenMap={onOpenMap} />

          {vehicle.trip && (
            <div className="pp-section">
              <div className="pp-label">Upcoming stops</div>
              <UpcomingStops data={schedule} now={now} nextSeq={vehicle.seq} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
