"use client";
import { useEffect, useRef, useState } from "react";
import { OCCUPANCY, STATUS, adherenceLabel, onTime, patternFor, stopName, variantLabel } from "@/lib/ladder";
import { SHAPE_STYLE, TILE_OPTS, TILE_URL, stopMarker, vehicleMarkerHtml } from "@/lib/mapStyle";
import { VehicleBadge } from "@/components/VehicleGlyph";
import { CloseIcon, DirectionsIcon, LocateIcon } from "@/components/Icons";
import { BlockSchedule, UpcomingStops, useVehicleSchedule } from "@/components/Minischedule";
import { RunBuilder, RunSchedule } from "@/components/RunView";

function distM(aLat, aLon, bLat, bLon) {
  const k = Math.PI / 180;
  const x = (bLon - aLon) * k * Math.cos(((aLat + bLat) / 2) * k);
  const y = (bLat - aLat) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// Nearest stop on the bus's route, for "Current location"
function nearestStop(pattern, v) {
  let best = null, bestD = Infinity;
  if (v.lat == null || v.lon == null) return null;
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

const fmtClock = (s) => new Date(s * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

// Operator ID on this bus today. Anyone signed in can set, change or clear it.
function OperatorEditor({ vehicle, onChanged }) {
  const info = vehicle.operatorInfo;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(info?.operatorId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setEditing(false); setError(""); }, [vehicle.id]);
  useEffect(() => { if (!editing) setVal(vehicle.operatorInfo?.operatorId || ""); }, [vehicle.operatorInfo?.operatorId, editing]);
  const fromSchedule = info?.source === "schedule";

  async function save(operatorId) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/operators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicle: vehicle.label, operatorId }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't save that."); return; }
      setEditing(false);
      onChanged?.();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <div className="op-view">
        {info ? <b>{info.name ? `${info.name.toUpperCase()} · ` : ""}#{info.operatorId}</b> : <span className="muted">Not entered</span>}
        <button className="op-edit" onClick={() => { setVal(info?.operatorId || ""); setEditing(true); }}>{info ? "Edit" : "Add"}</button>
        {info && <small className="op-who">{info.source === "schedule" ? "From the operator schedule for this run today" : `Entered by ${info.byName || "a user"} at ${fmtClock(info.at)}`}</small>}
      </div>
    );
  }
  return (
    <form className="op-form" onSubmit={(e) => { e.preventDefault(); save(val); }}>
      <input value={val} autoFocus onChange={(e) => setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12))} placeholder="Operator ID" aria-label="Operator ID"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      <button className="acct-btn acct-btn--primary" disabled={busy || !val}>Save</button>
      {info && !fromSchedule && <button type="button" className="acct-btn acct-btn--ghost" disabled={busy} onClick={() => save("")}>Clear</button>}
      <button type="button" className="acct-btn" onClick={() => setEditing(false)}>Cancel</button>
      {error && <div className="auth-error" role="alert">{error}</div>}
    </form>
  );
}

export default function VehiclePanel({ vehicle, route, now, onClose, onOpenMap, me, onChanged }) {
  const dir = route?.dirs?.[String(vehicle.dir)];
  const next = vehicle.nextStopName || stopName(route, vehicle.stop) || vehicle.stop || "Not available";
  const age = vehicle.ts ? Math.max(0, now - vehicle.ts) : null;
  const adh = adherenceLabel(vehicle.adherence);
  const status = onTime(vehicle.adherence);
  const headsign = vehicle.headsign || dir?.dest || (vehicle.route ? "" : "Not on a route");
  const pattern = patternFor(route, vehicle);
  const [tab, setTab] = useState("status");
  const [building, setBuilding] = useState(false);
  const operatorRow = (
    <dl className="pp-props pp-props--op">
      <dt>Operator</dt>
      <dd><OperatorEditor vehicle={vehicle} onChanged={onChanged} /></dd>
    </dl>
  );
  useEffect(() => { setBuilding(false); }, [vehicle.id]);
  const schedule = useVehicleSchedule(vehicle.trip);
  const near = nearestStop(pattern, vehicle);
  const crowd = CROWD[vehicle.occupancy];
  const hasPos = vehicle.lat != null && vehicle.lon != null;

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
          <BlockSchedule data={schedule} vehicle={vehicle} now={now} upFor={(d) => d === 0} onRunsChanged={() => { schedule?.reload?.(); onChanged?.(); }} />
        </div>
      )}

      {tab === "run" && (
        <div className="pp-body">
          {building && schedule ? (
            <RunBuilder data={schedule} vehicle={vehicle} onCancel={() => setBuilding(false)}
              onDone={() => { setBuilding(false); schedule.reload?.(); onChanged?.(); }} />
          ) : (
            <>
              {!schedule ? (
                <>{operatorRow}<p className="ms-empty pp-section">Loading run…</p></>
              ) : schedule.run ? (
                <>
                  <RunSchedule data={schedule} vehicle={vehicle} upFor={(d) => d === 0}>
                    {operatorRow}
                  </RunSchedule>
                  <div className="pp-section rb-open"><button className="acct-btn" onClick={() => setBuilding(true)}>Edit run {schedule.run.run}</button></div>
                </>
              ) : (
                <>{operatorRow}<div className="pp-section run-none">
                  <div className="pp-label">Run</div>
                  <p>No run has been built for this bus&apos;s trips yet.</p>
                  {vehicle.trip && schedule.block && <button className="acct-btn acct-btn--primary" onClick={() => setBuilding(true)}>Build a run</button>}
                </div></>
              )}
              <dl className="pp-props">
                <dt>Vehicle</dt><dd>{vehicle.label}</dd>
                <dt>Block</dt><dd>{vehicle.block || <span className="muted">Not available</span>}</dd>
                <dt>Trip</dt><dd>{vehicle.trip || "—"}{vehicle.revenue === false ? " (non-revenue)" : ""}</dd>
                <dt>Route pattern</dt><dd>{pattern?.name || <span className="muted">Not available</span>}</dd>
              </dl>
            </>
          )}
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
            <div className="pp-text">{near ? (near.d < 40 ? `At ${near.name}` : `Near ${near.name}`) : hasPos ? `${vehicle.lat.toFixed(4)}, ${vehicle.lon.toFixed(4)}` : "Not available"}</div>
            {hasPos && (
            <div className="pp-loc-actions">
              <a className="pp-directions" href={directionsUrl(vehicle)} target="_blank" rel="noreferrer">
                <DirectionsIcon size={16} /> Get directions to bus
              </a>
              <a className="pp-streetview" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${vehicle.lat},${vehicle.lon}${vehicle.bearing != null ? `&heading=${Math.round(vehicle.bearing)}` : ""}`}>
                Street View
              </a>
            </div>
          )}
          </div>

          <div className="pp-section">
            <div className="pp-label">{vehicle.status === "STOPPED_AT" ? STATUS.STOPPED_AT : "Next stop"}</div>
            <div className="pp-text">{next}</div>
          </div>

          {hasPos && <MiniMap route={route} vehicle={vehicle} onOpenMap={onOpenMap} />}

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
