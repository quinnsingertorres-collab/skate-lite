"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const fmtTime = (t) => (t ? clock.format(new Date(t * 1000)) : "—");

/** Fetches the bus's block schedule + live predictions; refreshes every 20s. */
export function useVehicleSchedule(trip) {
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const lastTrip = useRef(null);
  useEffect(() => {
    if (!trip) { setData(null); return; }
    let dead = false;
    const load = () =>
      fetch(`/api/vehicle-schedule?trip=${encodeURIComponent(trip)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!dead && d) setData(d); })
        .catch(() => {});
    if (lastTrip.current !== trip) { setData(null); lastTrip.current = trip; } // keep showing data on a manual reload
    load();
    const t = setInterval(load, 20000);
    return () => { dead = true; clearInterval(t); };
  }, [trip, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return data ? { ...data, reload } : null;
}

function Tri({ up, className = "" }) {
  return (
    <svg width="12" height="11" viewBox="-6 -5.5 12 11" aria-hidden="true" className={`ms-tri ${className}`}>
      <polygon points={up ? "0,-4.5 5,4 -5,4" : "0,4.5 5,-4 -5,-4"} />
    </svg>
  );
}

const minsFrom = (t, now) => Math.round((t - now) / 60);
function delta(pred, sched) {
  if (!pred || !sched) return null;
  const d = (pred - sched) / 60;
  const cls = d > 6 ? "late" : d < -1 ? "early" : "ontime";
  return { text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}`, cls };
}

/** Status tab: the rest of the current trip, with live predicted times. */
export function UpcomingStops({ data, now, nextSeq = null, limit = 8 }) {
  const [all, setAll] = useState(false);
  if (!data) return <p className="ms-empty">Loading upcoming stops…</p>;
  // Only stops still ahead of the bus (skipped stops behind it aren't "upcoming")
  const upcoming = data.predictions.filter(
    (p) => (nextSeq == null || p.seq >= nextSeq) && (p.skipped || p.time >= now - 30)
  );
  if (!upcoming.length) return <p className="ms-empty">No live predictions for this trip right now.</p>;
  const shown = all ? upcoming : upcoming.slice(0, limit);
  return (
    <div className="ms-upcoming">
      <ol>
        {shown.map((p, i) => {
          const d = delta(p.time, p.scheduled);
          const m = p.time ? minsFrom(p.time, now) : null;
          return (
            <li key={`${p.seq}-${p.stop}`} className={`${p.timepoint ? "is-tp" : ""}${i === 0 ? " is-next" : ""}${p.skipped ? " is-skipped" : ""}`}>
              <span className="ms-dot" aria-hidden="true" />
              <span className="ms-stop">
                <span className="ms-stop-name">{p.name}</span>
                {p.timepoint && <span className="ms-tp-id">{p.timepoint.toUpperCase()}</span>}
              </span>
              <span className="ms-times">
                {p.skipped ? (
                  <span className="ms-skipped">Skipped</span>
                ) : (
                  <>
                    <b>{fmtTime(p.time)}</b>
                    <span className="ms-in">{m <= 0 ? "now" : `${m} min`}</span>
                    {p.scheduled && (
                      <span className="ms-sched" title={`Scheduled ${fmtTime(p.scheduled)}`}>
                        sch {fmtTime(p.scheduled)}{d && <em className={d.cls}> {d.text}</em>}
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {upcoming.length > limit && (
        <button className="ms-more" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${upcoming.length} stops`}
        </button>
      )}
    </div>
  );
}

const hm = (secs) => {
  const m = Math.max(0, Math.round(secs / 60));
  const h = Math.floor(m / 60);
  return h ? `${h} hr ${m % 60} min` : `${m} min`;
};

function RailIcon({ kind, up, className = "" }) {
  if (kind === "trip")
    return (
      <span className={`bs-ic bs-ic--trip ${className}`}>
        <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d={up ? "M-4.5 2.5L0 -2.5L4.5 2.5" : "M-4.5 -2.5L0 2.5L4.5 -2.5"} /></svg>
      </span>
    );
  if (kind === "tp")
    return (
      <span className="bs-ic bs-ic--tp">
        <svg width="8" height="8" viewBox="-4 -4 8 8" aria-hidden="true"><path d={up ? "M-2.3 1.2L0 -1.2L2.3 1.2" : "M-2.3 -1.2L0 1.2L2.3 -1.2"} /></svg>
      </span>
    );
  if (kind === "garage")
    return (
      <span className="bs-ic bs-ic--garage">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <rect x="4" y="2.5" width="10" height="11" rx="2.4" />
          <path d="M4 8.2h10M6 13.5v2M12 13.5v2" />
          <circle cx="6.6" cy="11" r=".9" /><circle cx="11.4" cy="11" r=".9" />
        </svg>
      </span>
    );
  if (kind === "run") return <span className="bs-ic bs-ic--run" />;
  return <span className="bs-ic bs-ic--none" />;
}

/**
 * Block tab: the whole block as one continuous schedule (Skate's run/block layout):
 * pull out → each trip with its timepoints → layovers between trips → pull in.
 */
const tripName = (t) => `${t.route || ""}_${t.variant && t.variant !== "_" ? t.variant : ""} ${t.headsign || ""}`.trim();

// Create / edit / delete the runs on this block. Anyone signed in can edit; saved for every day the block runs.
function RunsEditor({ data, onChanged }) {
  const trips = data.trips;
  const [form, setForm] = useState(null); // { run, from, to, replaceStart }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const runs = (data.runs || []).slice().sort((a, b) => a.startSecs - b.startSecs);
  const startOf = (secs) => trips.find((t) => t.startSecs === secs);
  const firstFree = trips.find((t) => !t.run) || trips[0];

  async function save(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await fetch("/api/rundefs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: form.run, fromTrip: form.from, toTrip: form.to, replaceStart: form.replaceStart ?? null }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't save that run."); return; }
      setForm(null); onChanged?.();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }
  async function remove(def) {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/rundefs?block=${encodeURIComponent(data.block)}&start=${def.startSecs}`, { method: "DELETE" });
      if (!r.ok) { setError("Couldn't delete that run."); return; }
      onChanged?.();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }

  return (
    <div className="bs-runs">
      <div className="bs-runs-head">
        <span>Runs on this block</span>
        {!form && data.block && (
          <button className="acct-btn" onClick={() => { setError(""); setForm({ run: "", from: firstFree.trip, to: trips[trips.length - 1].trip }); }}>Create a run</button>
        )}
      </div>
      {!runs.length && !form && <p className="muted bs-runs-empty">No runs yet. Create one from this block&apos;s trips; it&apos;ll show on whichever bus works them, every day this block runs.</p>}
      {runs.length > 0 && (
        <ul className="bs-runs-list">
          {runs.map((d) => {
            const a = startOf(d.startSecs), b = startOf(d.endSecs);
            return (
              <li key={d.startSecs}>
                <b>Run {d.run}</b>
                <span className="muted">{a ? fmtTime(a.start) : "?"} – {b ? fmtTime(b.end) : "?"}{d.byName ? ` · by ${d.byName}` : ""}</span>
                <span className="bs-runs-btns">
                  <button className="op-edit" disabled={busy} onClick={() => { setError(""); setForm({ run: d.run, from: a?.trip || trips[0].trip, to: b?.trip || trips[trips.length - 1].trip, replaceStart: d.startSecs }); }}>Edit</button>
                  <button className="op-edit op-edit--danger" disabled={busy} onClick={() => remove(d)}>Delete</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {form && (
        <form className="bs-run-form" onSubmit={save}>
          <label><span>Run number</span>
            <input value={form.run} autoFocus required onChange={(e) => setForm({ ...form, run: e.target.value.toUpperCase().slice(0, 16) })} placeholder="e.g. 126-1411"
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </label>
          <label><span>First trip</span>
            <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}>
              {trips.map((t) => <option key={t.trip} value={t.trip}>{fmtTime(t.start)} · {tripName(t)}{t.run && t.runStart !== form.replaceStart ? ` (run ${t.run})` : ""}</option>)}
            </select>
          </label>
          <label><span>Last trip</span>
            <select value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>
              {trips.map((t) => <option key={t.trip} value={t.trip}>{fmtTime(t.start)} · {tripName(t)}{t.run && t.runStart !== form.replaceStart ? ` (run ${t.run})` : ""}</option>)}
            </select>
          </label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="bs-run-actions">
            <button className="acct-btn acct-btn--primary" disabled={busy || !form.run.trim()}>{busy ? "Saving…" : form.replaceStart != null ? "Save run" : "Create run"}</button>
            <button type="button" className="acct-btn" onClick={() => { setForm(null); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}
      {error && !form && <div className="auth-error" role="alert">{error}</div>}
    </div>
  );
}

export function BlockSchedule({ data, vehicle, now, upFor, onRunsChanged }) {
  const [showPast, setShowPast] = useState(false);
  if (!data) return <p className="ms-empty">Loading block…</p>;
  if (!data.trips.length) return <p className="ms-empty">No schedule found for this trip.</p>;
  const trips = data.trips;
  const curIdx = Math.max(0, trips.findIndex((t) => t.trip === data.trip));
  const nextSeq = vehicle.seq ?? null;
  const status = vehicleStatus(vehicle);

  const first = trips[0], last = trips[trips.length - 1];
  const inService = trips.reduce((a, t) => a + (t.end - t.start), 0);
  const span = last.end - first.start;
  const layover = Math.max(0, span - inService);

  const rows = [];
  trips.forEach((t, i) => {
    if (i < curIdx && !showPast) return;
    const state = i < curIdx ? "past" : i === curIdx ? "current" : "future";
    const up = upFor(t.dir);
    if (i > 0 && (showPast || i > curIdx)) {
      const gap = t.start - trips[i - 1].end;
      if (gap > 0) rows.push({ key: `lay-${t.trip}`, kind: "none", title: gap >= 45 * 60 ? "Break" : "Layover", time: hm(gap), cls: `bs-row--layover is-${i <= curIdx ? "past" : "future"}` });
    }
    const name = tripName(t);
    // Run boundary: a run starts here (or the list starts partway into a run)
    const prevShown = rows.some((r) => r.kind === "trip");
    if (t.run && (t.runStart === t.startSecs || !prevShown)) rows.push({ key: `run-${t.trip}`, kind: "run", title: `Run ${t.run}`, time: "", cls: "bs-row--run" });
    rows.push({ key: t.trip, kind: "trip", up, title: name, time: fmtTime(t.start), cls: `bs-row--trip is-${state}`, current: state === "current", status });
    for (const tp of t.timepoints) {
      const passed = state === "past" || (state === "current" && nextSeq != null && tp.seq < nextSeq);
      rows.push({ key: `${t.trip}-${tp.seq}`, kind: "tp", up, title: tp.name, time: fmtTime(tp.time), cls: `bs-row--tp${passed ? " is-past" : ""}` });
    }
  });

  return (
    <div className="bs">
      <div className="bs-id"><span>Block</span><b>{data.block || "—"}</b></div>
      <dl className="bs-summary">
        <dt>Trips</dt><dd>{trips.length}</dd>
        <dt>In service</dt><dd>{hm(inService)}</dd>
        <dt>Layovers</dt><dd>{hm(layover)}</dd>
        <dt>Total hours</dt><dd>{hm(span)}</dd>
      </dl>
      <RunsEditor data={data} onChanged={onRunsChanged} />
      <div className="bs-cols"><span>Departure point</span><span>Scheduled departure</span></div>
      {curIdx > 0 && (
        <button className="bs-past" onClick={() => setShowPast((s) => !s)}>
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><path d="M6 1L11 6H1zM6 15L1 10h10z" /></svg>
          {showPast ? "Hide past trips" : "Show past trips"}
        </button>
      )}
      <ol className="bs-list">
        {rows.map((r) => (
          <li key={r.key} className={`bs-row ${r.cls}${r.current ? ` is-here ${r.status}` : ""}`}>
            <span className="bs-rail"><RailIcon kind={r.kind} up={r.up} className={r.current ? r.status : ""} /></span>
            <span className="bs-name">
              {r.title}
              {r.sub && <small>{r.sub}</small>}
            </span>
            <span className="bs-time">{r.time}</span>
          </li>
        ))}
      </ol>
      <p className="ms-note">Scheduled times from the MBTA timetable. Runs aren&apos;t in the MBTA&apos;s public data.</p>
    </div>
  );
}

function vehicleStatus(v) {
  if (v.adherence == null) return "";
  return v.adherence < -60 ? "early" : v.adherence > 360 ? "late" : "ontime";
}
