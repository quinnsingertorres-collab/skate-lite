"use client";
import { useState } from "react";
import { adherenceMinutes, stopName } from "@/lib/ladder";
import { VehicleBadge } from "@/components/VehicleGlyph";

const LATE_SECS = 360; // Skate's "late" threshold

export default function LateView({ vehicles, routes, routeData, selectedRoutes, selectedId, onSelect }) {
  const [scope, setScope] = useState(selectedRoutes.length ? "selected" : "all");
  const inScope = (v) => scope === "all" || selectedRoutes.includes(v.route);
  const late = vehicles
    .filter((v) => v.route && v.adherence != null && v.adherence > LATE_SECS && inScope(v))
    .sort((a, b) => b.adherence - a.adherence);
  const withData = vehicles.filter((v) => v.route && v.adherence != null && inScope(v)).length;
  const nameOf = (id) => routes.find((r) => r.id === id)?.name || id;

  return (
    <div className="late-view">
      <div className="late-head">
        <h1>Late buses</h1>
        <div className="late-scope" role="radiogroup" aria-label="Which routes">
          <button role="radio" aria-checked={scope === "selected"} className={scope === "selected" ? "is-on" : ""} onClick={() => setScope("selected")} disabled={!selectedRoutes.length}>
            My routes{selectedRoutes.length ? ` (${selectedRoutes.length})` : ""}
          </button>
          <button role="radio" aria-checked={scope === "all"} className={scope === "all" ? "is-on" : ""} onClick={() => setScope("all")}>All routes</button>
        </div>
        <span className="late-count">
          {late.length} late of {withData} buses with schedule data
        </span>
      </div>

      {late.length === 0 ? (
        <p className="late-empty">No buses are more than 6 minutes late right now.</p>
      ) : (
        <div className="late-table-wrap">
          <table className="late-table">
            <thead>
              <tr>
                <th>Late</th>
                <th>Route</th>
                <th>Vehicle</th>
                <th className="hide-sm">Run</th>
                <th>Headed to</th>
                <th className="hide-sm">Next stop</th>
              </tr>
            </thead>
            <tbody>
              {late.map((v) => {
                const r = routeData[v.route];
                const dest = v.headsign || r?.dirs?.[String(v.dir)]?.dest || routes.find((x) => x.id === v.route)?.dirs?.[String(v.dir)]?.dest || "—";
                return (
                  <tr key={v.id} className={v.id === selectedId ? "is-selected" : ""} onClick={() => onSelect(v)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(v)}>
                    <td className="late-mins">{adherenceMinutes(v.adherence)} mins</td>
                    <td><span className="route-pill">{nameOf(v.route)}</span></td>
                    <td className="late-veh"><VehicleBadge vehicle={v} /> </td>
                    <td className="hide-sm">{v.run || "—"}</td>
                    <td>{dest}</td>
                    <td className="hide-sm">{v.nextStopName || stopName(r, v.stop) || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
