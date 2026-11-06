"use client";
// Run tab: a run laid out like Skate (summary + one continuous timeline), and a builder
// for making runs from the public schedule: pieces of trips plus activities.
import { useEffect, useMemo, useState } from "react";
import { RailIcon, fmtTime, hm, tripName, vehicleStatus } from "@/components/Minischedule";

const LABEL = { report: "Report time", pullout: "Pull out", pullback: "Pull back", deadhead: "Deadhead", done: "Done" };
const GARAGES = ["Albany Garage", "Arborway Garage", "Cabot Garage", "Charlestown Garage", "Fellsway Garage", "Lynn Garage", "North Cambridge Garage", "Quincy Garage", "Somerville Garage", "Southampton Garage", "Wellington Garage"];

const itemStart = (x) => (x.type === "trip" ? x.start : x.time);
const itemEnd = (x) => (x.type === "trip" ? x.end : x.type === "break" ? x.end : x.time);

/** Paid break / working hours / total hours for a laid-out run. */
function summary(items) {
  if (!items.length) return null;
  const start = Math.min(...items.map(itemStart)), end = Math.max(...items.map(itemEnd));
  const brk = (paid) => items.filter((x) => x.type === "break" && !!x.paid === paid).reduce((a, x) => a + x.mins * 60, 0);
  return { paid: brk(true), working: end - start - brk(false), total: end - start };
}

export function RunSchedule({ data, vehicle, upFor, children }) {
  const [showPast, setShowPast] = useState(false);
  const run = data.run;
  const items = run.items;
  const sum = summary(items);
  const found = items.findIndex((x) => x.type === "trip" && x.trip === data.trip);
  const curIdx = Math.max(0, found); // no current trip: show the whole run, nothing highlighted
  const nextSeq = vehicle.seq ?? null;
  const status = vehicleStatus(vehicle);

  const rows = [];
  items.forEach((x, i) => {
    if (i < curIdx && !showPast) return;
    const past = i < curIdx;
    const prev = items[i - 1];
    if (x.type === "trip" && prev?.type === "trip" && (showPast || i > curIdx)) {
      const gap = x.start - prev.end;
      if (gap > 0) rows.push({ key: `lay-${x.trip}`, kind: "none", title: "Layover", time: hm(gap), cls: `bs-row--layover${past || i === curIdx ? " is-past" : ""}` });
    }
    if (x.type === "trip") {
      const here = i === curIdx && found >= 0;
      const up = upFor(x.dir);
      rows.push({ key: x.trip, kind: "trip", up, title: tripName(x), time: fmtTime(x.start), cls: `bs-row--trip${past ? " is-past" : ""}${here ? ` is-here ${status}` : ""}`, iconCls: here ? status : "" });
      x.timepoints.forEach((tp, j) => {
        const passed = past || (here && nextSeq != null && tp.seq < nextSeq);
        const lit = here && (j === 0 || passed);
        rows.push({ key: `${x.trip}-${tp.seq}`, kind: "tp", up, title: tp.name, time: fmtTime(tp.time), cls: `bs-row--tp${lit ? ` is-here is-here-tp ${status}` : passed ? " is-past" : ""}` });
      });
    } else {
      const title = x.type === "break" ? `Break (${x.paid ? "Paid" : "Unpaid"})` : LABEL[x.type];
      const kind = x.type === "pullout" || x.type === "pullback" ? "garage" : x.type === "deadhead" ? "deadhead" : "none";
      rows.push({ key: `${x.type}-${x.time}-${i}`, kind, title, sub: x.place, time: x.type === "break" ? hm(x.mins * 60) : fmtTime(x.time), cls: `bs-row--act${past ? " is-past" : ""}` });
    }
  });

  return (
    <div className="bs">
      <div className="bs-id"><span>Run</span><b>{run.run}</b></div>
      {children}
      {sum && (
        <dl className="bs-summary">
          <dt>Paid break</dt><dd>{hm(sum.paid)}</dd>
          <dt>Working hours</dt><dd>{hm(sum.working)}</dd>
          <dt>Total hours</dt><dd>{hm(sum.total)}</dd>
        </dl>
      )}
      <div className="bs-cols"><span>Departure point</span><span>Scheduled departure</span></div>
      {curIdx > 0 && (
        <button className="bs-past" onClick={() => setShowPast((s) => !s)}>
          <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true"><path d="M6 1L11 6H1zM6 15L1 10h10z" /></svg>
          {showPast ? "Hide past trips" : "Show past trips"}
        </button>
      )}
      <ol className="bs-list">
        {rows.map((r) => (
          <li key={r.key} className={`bs-row ${r.cls}`}>
            <span className="bs-rail"><RailIcon kind={r.kind} up={r.up} className={r.iconCls || ""} /></span>
            <span className="bs-name">{r.title}{r.sub && <small>{r.sub}</small>}</span>
            <span className="bs-time">{r.time}</span>
          </li>
        ))}
      </ol>
      <p className="ms-note">Run built by {run.byName || "a user"} from the MBTA&apos;s public schedule.</p>
    </div>
  );
}

// ---- Builder ----------------------------------------------------------------

const toHHMM = (secs) => { const m = Math.round(secs / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
// Times before 3 AM belong to the end of the service day (after midnight)
const fromHHMM = (v) => { const [h, m] = String(v).split(":").map(Number); if (!Number.isFinite(h) || !Number.isFinite(m)) return null; const s = h * 3600 + m * 60; return s < 3 * 3600 ? s + 86400 : s; };

function useBlockTrips(block) {
  const [state, setState] = useState({ block: null, trips: null, error: "" });
  useEffect(() => {
    if (!block) return;
    let dead = false;
    setState({ block, trips: null, error: "" });
    fetch(`/api/block?block=${encodeURIComponent(block)}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!dead) setState(ok ? { block, trips: d.trips, base: d.trips[0] ? d.trips[0].start - d.trips[0].startSecs : 0, error: "" } : { block, trips: [], error: d.error || "Couldn't load that block." }); })
      .catch(() => { if (!dead) setState({ block, trips: [], error: "Couldn't reach the server." }); });
    return () => { dead = true; };
  }, [block]);
  return state;
}

function TripsAdder({ defaultBlock, defaultFrom, onAdd }) {
  const [blockInput, setBlockInput] = useState(defaultBlock || "");
  const [block, setBlock] = useState(defaultBlock || "");
  const bt = useBlockTrips(block);
  const [from, setFrom] = useState(null), [to, setTo] = useState(null);
  useEffect(() => {
    if (!bt.trips?.length) return;
    const f = bt.trips.find((t) => t.startSecs === defaultFrom) || bt.trips[0];
    setFrom(f.startSecs); setTo(bt.trips[bt.trips.length - 1].startSecs);
  }, [bt.trips]); // eslint-disable-line react-hooks/exhaustive-deps
  const opt = (t) => <option key={t.trip} value={t.startSecs}>{fmtTime(t.start)} · {tripName(t)}</option>;
  return (
    <div className="rb-box">
      <div className="rb-box-title">Add trips from a block</div>
      <div className="rb-row">
        <input value={blockInput} onChange={(e) => setBlockInput(e.target.value.toUpperCase().trim())} placeholder="Block, e.g. C01-31" aria-label="Block"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button type="button" className="acct-btn" onClick={() => setBlock(blockInput)} disabled={!blockInput}>Load</button>
      </div>
      {bt.error && <div className="auth-error">{bt.error}</div>}
      {block && !bt.trips && <p className="muted">Loading block…</p>}
      {bt.trips?.length > 0 && (
        <>
          <label><span>First trip</span><select value={from ?? ""} onChange={(e) => setFrom(Number(e.target.value))}>{bt.trips.map(opt)}</select></label>
          <label><span>Last trip</span><select value={to ?? ""} onChange={(e) => setTo(Number(e.target.value))}>{bt.trips.map(opt)}</select></label>
          <button type="button" className="acct-btn acct-btn--primary" disabled={from == null || to == null || to < from}
            onClick={() => onAdd({ type: "trips", block: bt.block, startSecs: from, endSecs: to },
              bt.trips.filter((t) => t.startSecs >= from && t.startSecs <= to))}>
            {to < from ? "Last trip is before the first" : "Add these trips"}
          </button>
        </>
      )}
    </div>
  );
}

function ActivityAdder({ onAdd, suggestTime }) {
  const [type, setType] = useState("report");
  const [time, setTime] = useState(suggestTime || "");
  const [place, setPlace] = useState("");
  const [mins, setMins] = useState("30");
  const [paid, setPaid] = useState(false);
  useEffect(() => { if (suggestTime) setTime(suggestTime); }, [suggestTime]);
  const garageish = ["report", "pullout", "pullback", "done", "break"].includes(type);
  return (
    <div className="rb-box">
      <div className="rb-box-title">Add an activity</div>
      <div className="rb-row">
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Activity">
          <option value="report">Report time</option><option value="pullout">Pull out</option><option value="pullback">Pull back</option>
          <option value="deadhead">Deadhead</option><option value="break">Break</option><option value="done">Done</option>
        </select>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
      </div>
      {type === "break" && (
        <div className="rb-row">
          <input type="number" min="1" max="600" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Break length in minutes" />
          <span className="rb-unit">min</span>
          <label className="rb-check"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Paid</label>
        </div>
      )}
      <input value={place} onChange={(e) => setPlace(e.target.value)} list={garageish ? "rb-garages" : undefined} placeholder={garageish ? "Place, e.g. Fellsway Garage" : "From where, e.g. Sullivan Square"} aria-label="Place" maxLength={50} />
      <datalist id="rb-garages">{GARAGES.map((g) => <option key={g} value={g} />)}</datalist>
      <button type="button" className="acct-btn acct-btn--primary" disabled={fromHHMM(time) == null}
        onClick={() => { onAdd({ type, secs: fromHHMM(time), place, ...(type === "break" ? { mins: Number(mins), paid } : {}) }); setPlace(""); }}>
        Add {type === "break" ? "break" : LABEL[type].toLowerCase()}
      </button>
    </div>
  );
}

export function RunBuilder({ data, vehicle, onDone, onCancel }) {
  const existing = data.runDef;
  const [run, setRun] = useState(existing?.run || "");
  const [items, setItems] = useState(existing?.items || []);
  const [labels, setLabels] = useState({}); // trips-piece key -> description
  const [ends, setEnds] = useState({});     // trips-piece key -> when its last trip ends (secs of day)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = data.base || 0;
  const cur = data.trips?.find((t) => t.trip === data.trip);

  const pieceKey = (x) => `${x.block}|${x.startSecs}`;
  const sorted = useMemo(() => [...items].sort((a, b) => (a.type === "trips" ? a.startSecs : a.secs) - (b.type === "trips" ? b.startSecs : b.secs)), [items]);
  const lastEnd = sorted.length ? sorted[sorted.length - 1] : null;
  const suggest = lastEnd ? toHHMM(lastEnd.type === "trips" ? (ends[pieceKey(lastEnd)] ?? lastEnd.endSecs) : lastEnd.secs + (lastEnd.mins || 0) * 60) : "";

  const describe = (x) => {
    if (x.type === "trips") return labels[pieceKey(x)] || `Block ${x.block} · trips ${fmtTime(base + x.startSecs)} – ${fmtTime(base + x.endSecs)}`;
    const name = x.type === "break" ? `Break (${x.paid ? "Paid" : "Unpaid"}) ${x.mins} min` : LABEL[x.type];
    return `${name} · ${fmtTime(base + x.secs)}${x.place ? ` · ${x.place}` : ""}`;
  };

  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/rundefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existing?.id, run, items }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't save the run."); return; }
      onDone();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/rundefs?id=${encodeURIComponent(existing.id)}`, { method: "DELETE" });
      if (!r.ok) { setError("Couldn't delete the run."); return; }
      onDone();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }

  return (
    <div className="rb">
      <div className="rb-head">{existing ? `Edit run ${existing.run}` : "Build a run"}</div>
      <p className="muted rb-help">A run is the operator&apos;s day: pieces of trips from the public schedule plus report time, pull outs, breaks and so on. It shows on whichever bus works its trips, every day those blocks run. Anyone signed in can edit it.</p>
      <label className="rb-field"><span>Run number</span>
        <input value={run} onChange={(e) => setRun(e.target.value.toUpperCase().slice(0, 16))} placeholder="e.g. 126-1411" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </label>

      <div className="rb-items">
        <div className="rb-box-title">In this run</div>
        {!sorted.length && <p className="muted">Nothing yet. Add trips and activities below.</p>}
        <ol>
          {sorted.map((x) => (
            <li key={x.type === "trips" ? pieceKey(x) : `${x.type}-${x.secs}-${x.place}`} className={x.type === "trips" ? "is-trips" : ""}>
              <span>{describe(x)}</span>
              <button type="button" className="op-edit op-edit--danger" onClick={() => setItems(items.filter((y) => y !== x))}>Remove</button>
            </li>
          ))}
        </ol>
      </div>

      <TripsAdder defaultBlock={vehicle.block || data.block || ""} defaultFrom={cur ? cur.startSecs : null}
        onAdd={(piece, trips) => {
          setItems([...items, piece]);
          if (trips.length) setEnds({ ...ends, [pieceKey(piece)]: trips[trips.length - 1].end - (trips[0].start - trips[0].startSecs) });
          if (trips.length) setLabels({ ...labels, [pieceKey(piece)]: `Block ${piece.block} · ${trips.length} trip${trips.length === 1 ? "" : "s"}, ${fmtTime(trips[0].start)} – ${fmtTime(trips[trips.length - 1].end)} (${tripName(trips[0])}${trips.length > 1 ? " …" : ""})` });
        }} />
      <ActivityAdder onAdd={(a) => setItems([...items, a])} suggestTime={suggest} />

      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="rb-actions">
        <button className="acct-btn acct-btn--primary" disabled={busy || !run.trim() || !items.some((x) => x.type === "trips")} onClick={save}>{busy ? "Saving…" : "Save run"}</button>
        <button className="acct-btn" onClick={onCancel}>Cancel</button>
        {existing && (confirmDelete
          ? <button className="acct-btn acct-btn--danger" disabled={busy} onClick={remove}>Confirm delete</button>
          : <button className="acct-btn acct-btn--ghost" onClick={() => setConfirmDelete(true)}>Delete run</button>)}
      </div>
    </div>
  );
}
