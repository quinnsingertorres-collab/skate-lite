"use client";
// Swings view, like Skate's: upcoming swings (one run hands its bus to another partway through a
// block), with past swings on request. Built from the runs people have made from the schedule.
import { useCallback, useEffect, useState } from "react";
import { runShort } from "@/lib/labels";
import { VehicleBadge } from "@/components/VehicleGlyph";

const PAST_SECS = 15 * 60; // a swing stays "upcoming" for 15 minutes after its time
const clock = (t) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function Operator({ op }) {
  if (!op) return <span className="sw-none">—</span>;
  return <span className="sw-op">{op.name ? <b>{op.name.toUpperCase()}</b> : null}{op.name ? " " : ""}<small>#{op.operatorId}</small></span>;
}
function Run({ run }) {
  return <span className="sw-run" title={run.run}>{runShort(run.run) || run.run}</span>;
}

export default function SwingsView({ vehicles, now, routes, selectedRoutes, onSelect, onBlock }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [scope, setScope] = useState(selectedRoutes.length ? "selected" : "all");
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/swings", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't load swings");
      setData(j); setError("");
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const nameOf = (id) => routes.find((r) => r.id === id)?.name || id;
  const busOn = (block) => vehicles.find((v) => v.block === block);
  const all = (data?.swings || []).filter((w) => scope === "all" || selectedRoutes.includes(w.route) || selectedRoutes.includes(w.onRoute));
  const past = all.filter((w) => w.time < now - PAST_SECS);
  const rows = showPast ? all : all.filter((w) => w.time >= now - PAST_SECS);

  return (
    <div className="late-view sw-view">
      <div className="late-head">
        <h1>Swings View</h1>
        <div className="late-scope" role="radiogroup" aria-label="Which routes">
          <button role="radio" aria-checked={scope === "selected"} className={scope === "selected" ? "is-on" : ""} onClick={() => setScope("selected")} disabled={!selectedRoutes.length}>
            My routes{selectedRoutes.length ? ` (${selectedRoutes.length})` : ""}
          </button>
          <button role="radio" aria-checked={scope === "all"} className={scope === "all" ? "is-on" : ""} onClick={() => setScope("all")}>All routes</button>
        </div>
        <button className="acct-btn" onClick={() => setShowPast((x) => !x)} disabled={!past.length && !showPast}>
          {showPast ? "Hide past swings" : `Show past swings${past.length ? ` (${past.length})` : ""}`}
        </button>
      </div>

      {error && <p className="late-empty">{error}</p>}
      {!data && !error && <p className="late-empty">Loading swings…</p>}
      {data && rows.length === 0 && (
        <p className="late-empty">
          {data.runsBuilt === 0
            ? "No runs have been built yet. Swings appear here when two runs share a block: build runs from a bus's Run tab or from a block in the schedule."
            : "No swings in the next six hours on these routes. A swing shows once runs are built on both sides of it."}
        </p>
      )}
      {rows.length > 0 && (
        <div className="late-table-wrap">
          <table className="late-table sw-table">
            <thead>
              <tr>
                <th>Swing off</th>
                <th>Route</th>
                <th>Off run</th>
                <th className="hide-sm">Off operator</th>
                <th>Vehicle</th>
                <th>On run</th>
                <th className="hide-sm">On operator</th>
                <th className="hide-sm">Swing on</th>
                <th className="hide-sm">Place</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const v = busOn(w.block);
                const isPast = w.time < now - PAST_SECS;
                const open = () => (v ? onSelect(v) : onBlock?.(w.block));
                return (
                  <tr key={w.id} className={isPast ? "is-hidden" : ""} onClick={open} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open()} title={`Block ${w.block}`}>
                    <td className="sw-time">{clock(w.time)}{!isPast && w.time - now <= 15 * 60 && w.time >= now - PAST_SECS ? <span className="sw-soon">{w.time <= now ? "now" : `${Math.ceil((w.time - now) / 60)} min`}</span> : null}</td>
                    <td><span className="route-pill">{nameOf(w.route)}</span></td>
                    <td><Run run={w.offRun} /></td>
                    <td className="hide-sm"><Operator op={w.offOperator} /></td>
                    <td className="late-veh">{v ? <VehicleBadge vehicle={v} /> : <span className="sw-none" title="No bus on this block right now">—</span>}</td>
                    <td><Run run={w.onRun} /></td>
                    <td className="hide-sm"><Operator op={w.onOperator} /></td>
                    <td className="hide-sm">{clock(w.onTime)}</td>
                    <td className="hide-sm">{w.place || "—"}</td>
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
