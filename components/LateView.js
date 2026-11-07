"use client";
// Late View, like Skate's: "Missing logons" (blocks that should have started in the last 45 minutes
// but have no bus) and "Late buses" (15+ minutes late). Rows can be hidden for a while.
import { useEffect, useState } from "react";
import { adherenceMinutes, stopName } from "@/lib/ladder";
import { displayLabel } from "@/lib/labels";
import { VehicleBadge } from "@/components/VehicleGlyph";

const LATE_SECS = 15 * 60;          // Skate: late buses are 15+ minutes late
const MISSING_LOGON_SECS = 45 * 60; // Skate: missing logons from the last 45 minutes
const HIDE_KEY = "skate-lite:late-hidden";
const HIDE_FOR_MS = 8 * 3600 * 1000;
const clock = (t) => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function useHidden() {
  const [hidden, setHidden] = useState({});
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(HIDE_KEY) || "{}");
      const now = Date.now();
      setHidden(Object.fromEntries(Object.entries(raw).filter(([, at]) => now - at < HIDE_FOR_MS)));
    } catch {}
  }, []);
  const save = (h) => { setHidden(h); try { localStorage.setItem(HIDE_KEY, JSON.stringify(h)); } catch {} };
  return [hidden, save];
}

export default function LateView({ vehicles, ghosts = [], onGhost, now, routes, routeData, selectedRoutes, selectedId, onSelect }) {
  const [scope, setScope] = useState(selectedRoutes.length ? "selected" : "all");
  const [hidden, setHidden] = useHidden();
  const [showHidden, setShowHidden] = useState(false);
  const [checked, setChecked] = useState({});
  const [undo, setUndo] = useState(null);
  const inScope = (x) => scope === "all" || selectedRoutes.includes(x.route);
  const visible = (key) => showHidden || !hidden[key];
  const nameOf = (id) => routes.find((r) => r.id === id)?.name || id;

  const missing = ghosts
    .filter((g) => inScope(g) && now - g.scheduledLogon >= 0 && now - g.scheduledLogon <= MISSING_LOGON_SECS)
    .filter((g) => visible(g.id))
    .sort((a, b) => a.scheduledLogon - b.scheduledLogon);
  const late = vehicles
    .filter((v) => v.route && v.adherence != null && v.adherence >= LATE_SECS && inScope(v))
    .filter((v) => visible(v.id))
    .sort((a, b) => b.adherence - a.adherence);
  const hiddenCount = Object.keys(hidden).length;
  const selectedKeys = Object.keys(checked).filter((k) => checked[k]);

  function hideSelected() {
    const at = Date.now();
    const next = { ...hidden };
    for (const k of selectedKeys) next[k] = at;
    setHidden(next); setChecked({}); setUndo(selectedKeys);
    setTimeout(() => setUndo((u) => (u === selectedKeys ? null : u)), 6000);
  }
  function unhide(keys) {
    const next = { ...hidden };
    for (const k of keys) delete next[k];
    setHidden(next); setUndo(null);
  }
  const box = (key) => (
    <td className="late-check" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" aria-label="Select to hide" checked={!!checked[key]} onChange={(e) => setChecked({ ...checked, [key]: e.target.checked })} />
    </td>
  );

  return (
    <div className="late-view">
      <div className="late-head">
        <h1>Late View</h1>
        <div className="late-scope" role="radiogroup" aria-label="Which routes">
          <button role="radio" aria-checked={scope === "selected"} className={scope === "selected" ? "is-on" : ""} onClick={() => setScope("selected")} disabled={!selectedRoutes.length}>
            My routes{selectedRoutes.length ? ` (${selectedRoutes.length})` : ""}
          </button>
          <button role="radio" aria-checked={scope === "all"} className={scope === "all" ? "is-on" : ""} onClick={() => setScope("all")}>All routes</button>
        </div>
        {hiddenCount > 0 && (
          <label className="late-showhidden"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden ({hiddenCount})</label>
        )}
      </div>

      <section className="late-panel">
        <h2>Missing logons <span>{missing.length}</span></h2>
        {missing.length === 0 ? (
          <p className="late-empty">No blocks that started in the last 45 minutes are missing a bus.</p>
        ) : (
          <div className="late-table-wrap">
            <table className="late-table">
              <thead><tr><th aria-label="Hide" /><th>Scheduled logon</th><th>Route</th><th>Run</th><th className="hide-sm">Block</th><th>Headed to</th></tr></thead>
              <tbody>
                {missing.map((g) => (
                  <tr key={g.id} className={hidden[g.id] ? "is-hidden" : ""} onClick={() => onGhost?.(g)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onGhost?.(g)}>
                    {box(g.id)}
                    <td className="late-mins">{clock(g.scheduledLogon)}</td>
                    <td><span className="route-pill">{nameOf(g.route)}</span></td>
                    <td>{displayLabel(g)}</td>
                    <td className="hide-sm">{g.block}</td>
                    <td>{g.headsign || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="late-panel">
        <h2>Late buses <span>{late.length}</span></h2>
        {late.length === 0 ? (
          <p className="late-empty">No buses are 15 or more minutes late right now.</p>
        ) : (
          <div className="late-table-wrap">
            <table className="late-table">
              <thead><tr><th aria-label="Hide" /><th>Late</th><th>Route</th><th>Vehicle</th><th className="hide-sm">Run</th><th>Headed to</th><th className="hide-sm">Next stop</th></tr></thead>
              <tbody>
                {late.map((v) => {
                  const r = routeData[v.route];
                  const dest = v.headsign || r?.dirs?.[String(v.dir)]?.dest || routes.find((x) => x.id === v.route)?.dirs?.[String(v.dir)]?.dest || "—";
                  return (
                    <tr key={v.id} className={`${v.id === selectedId ? "is-selected" : ""}${hidden[v.id] ? " is-hidden" : ""}`} onClick={() => onSelect(v)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(v)}>
                      {box(v.id)}
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
      </section>

      {selectedKeys.length > 0 && (
        <div className="late-pop">
          <span>{selectedKeys.length} selected</span>
          {selectedKeys.every((k) => hidden[k])
            ? <button className="acct-btn acct-btn--primary" onClick={() => { unhide(selectedKeys); setChecked({}); }}>Unhide</button>
            : <button className="acct-btn acct-btn--primary" onClick={hideSelected}>Hide</button>}
          <button className="acct-btn" onClick={() => setChecked({})}>Cancel</button>
        </div>
      )}
      {undo && !selectedKeys.length && (
        <div className="late-pop">
          <span>Hidden for 8 hours.</span>
          <button className="acct-btn" onClick={() => unhide(undo)}>Undo</button>
        </div>
      )}
    </div>
  );
}
