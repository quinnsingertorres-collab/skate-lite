"use client";
// A block or run looked up from the public schedule (no live bus needed).
import { useCallback, useEffect, useState } from "react";
import { BlockSchedule, fmtTime } from "@/components/Minischedule";
import { RunBuilder, RunSchedule } from "@/components/RunView";
import { CloseIcon } from "@/components/Icons";

const NO_BUS = { seq: null, adherence: null, block: null };

export default function SchedulePanel({ target, vehicles, routes, onClose, onOpenVehicle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let dead = false;
    setError(""); setBuilding(false);
    const dq = target.date ? `&date=${target.date}` : "";
    const url = target.kind === "run" ? `/api/schedule?run=${encodeURIComponent(target.id)}${dq}` : `/api/schedule?block=${encodeURIComponent(target.block)}${dq}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (dead) return; if (ok) setData(d); else { setData(null); setError(d.error || "Couldn't load that schedule."); } })
      .catch(() => { if (!dead) setError("Couldn't reach the server."); });
    return () => { dead = true; };
  }, [target.kind, target.id, target.block, target.date, nonce]);

  // Live bus working it right now, if any
  const isToday = !target.date;
  const live = data && isToday
    ? vehicles.filter((v) => (data.kind === "run" ? v.runDef?.id === data.run?.id : v.block === data.block))
    : [];
  const routeName = (id) => routes.find((r) => r.id === id)?.name || id;
  const title = target.kind === "run" ? `Run ${data?.run?.run || ""}` : `Block ${target.block}`;
  const blockRoutes = data?.kind === "block" ? [...new Set(data.trips.map((t) => t.route).filter(Boolean))] : [];

  return (
    <aside className="pp" aria-label={title}>
      <div className="pp-bar">
        <span />
        <h2>Schedule</h2>
        <button className="pp-close" onClick={onClose} aria-label="Close schedule"><CloseIcon size={22} /></button>
      </div>
      <div className="sp-head">
        <div className="sp-title">{title}</div>
        <div className="sp-sub">
          {blockRoutes.map((r) => <span key={r} className="route-pill">{routeName(r)}</span>)}
          {data?.kind === "block" && data.trips.length > 0 && <span className="muted">{fmtTime(data.trips[0].start)} – {fmtTime(data.trips[data.trips.length - 1].end)} · {data.trips.length} trips</span>}
          {data?.kind === "run" && data.runDef && <span className="muted">Blocks {[...new Set(data.runDef.items.filter((x) => x.type === "trips").map((x) => x.block))].join(", ")}</span>}
        </div>
        <div className="sp-live">
          {data && (live.length
            ? live.map((v) => <button key={v.id} className="acct-btn acct-btn--primary" onClick={() => onOpenVehicle(v)}>Open bus {v.label} (live)</button>)
            : <span className="muted">{isToday ? "No bus is on it right now. Times are from the MBTA schedule." : `Schedule for ${new Date(Date.UTC(+data.date.slice(0, 4), +data.date.slice(4, 6) - 1, +data.date.slice(6, 8), 12)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}. Runs you build apply every day this block runs.`}</span>)}
        </div>
      </div>

      <div className="pp-body">
        {error && <p className="ms-empty pp-section">{error}</p>}
        {!data && !error && <p className="ms-empty pp-section">Loading schedule…</p>}
        {data && building && (
          <RunBuilder data={data} vehicle={{ ...NO_BUS, block: data.block }} onCancel={() => setBuilding(false)} onDone={() => { setBuilding(false); reload(); }} />
        )}
        {data && !building && data.kind === "block" && (
          <>
            <div className="pp-section rb-open"><button className="acct-btn" onClick={() => setBuilding(true)}>Build a run from this block</button></div>
            <BlockSchedule data={data} vehicle={NO_BUS} upFor={(d) => d === 0} />
          </>
        )}
        {data && !building && data.kind === "run" && (
          <>
            <RunSchedule data={data} vehicle={NO_BUS} upFor={(d) => d === 0} />
            <div className="pp-section rb-open"><button className="acct-btn" onClick={() => setBuilding(true)}>Edit run {data.run.run}</button></div>
          </>
        )}
      </div>
    </aside>
  );
}
