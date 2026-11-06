"use client";
// Run tab: a run laid out like Skate (summary + one continuous timeline), and a builder
// for making runs from the public schedule: pieces of trips plus activities.
import { useCallback, useEffect, useMemo, useState } from "react";
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

// ---- Builder: building blocks ------------------------------------------------
// The run is a stack of blocks you tap in from the palette: Report, Pull out, Trips, Deadhead,
// Break, Pull back, Done. Each block is a card you can edit in place, move up/down or remove.
// Times fill in from the block before; trips come from any block in the public schedule.

const toHHMM = (secs) => { if (secs == null) return ""; const m = Math.round(secs / 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
// Times before 3 AM belong to the end of the service day (after midnight)
const fromHHMM = (v) => { const [h, m] = String(v).split(":").map(Number); if (!Number.isFinite(h) || !Number.isFinite(m)) return null; const s = h * 3600 + m * 60; return s < 3 * 3600 ? s + 86400 : s; };

const to12 = (secs) => { if (secs == null) return ""; const m = Math.round(secs / 60), h = Math.floor(m / 60) % 24; return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

const KINDS = [
  { type: "report", label: "Report", cls: "k-report" },
  { type: "pullout", label: "Pull out", cls: "k-garage" },
  { type: "trips", label: "Trips", cls: "k-trips" },
  { type: "deadhead", label: "Deadhead", cls: "k-deadhead" },
  { type: "break", label: "Break", cls: "k-break" },
  { type: "pullback", label: "Pull back", cls: "k-garage" },
  { type: "done", label: "Done", cls: "k-done" },
];
const kindOf = (t) => KINDS.find((k) => k.type === t);
let uid = 0;
const newKey = () => `b${Date.now().toString(36)}${uid++}`;

/** When a block starts and ends (seconds of service day), or null if unknown yet. */
const startOf = (b) => (b.type === "trips" ? b.startSecs ?? null : b.secs ?? null);
const endOf = (b) => (b.type === "trips" ? b._end ?? b.endSecs ?? null : b.type === "break" ? (b.secs ?? 0) + (b.mins || 0) * 60 : b.secs ?? null);

function useBlockTrips(block) {
  const [state, setState] = useState({ block: null, trips: null, error: "" });
  useEffect(() => {
    if (!block) { setState({ block: null, trips: null, error: "" }); return; }
    let dead = false;
    setState({ block, trips: null, error: "" });
    fetch(`/api/block?block=${encodeURIComponent(block)}`).then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!dead) setState(ok ? { block, trips: d.trips, error: "" } : { block, trips: [], error: d.error || "Couldn't load that block." }); })
      .catch(() => { if (!dead) setState({ block, trips: [], error: "Couldn't reach the server." }); });
    return () => { dead = true; };
  }, [block]);
  return state;
}

function TripsCard({ b, onChange, defaultFrom }) {
  const [input, setInput] = useState(b.block || "");
  const bt = useBlockTrips(b.block);
  // Pick sensible first/last trips once the block loads; keep the card's own label/end in sync
  useEffect(() => {
    if (!bt.trips?.length) return;
    const from = b.startSecs ?? (bt.trips.find((t) => t.startSecs === defaultFrom) || bt.trips[0]).startSecs;
    const to = b.endSecs ?? bt.trips[bt.trips.length - 1].startSecs;
    sync(from, to);
  }, [bt.trips]); // eslint-disable-line react-hooks/exhaustive-deps
  function sync(from, to) {
    const ts = (bt.trips || []).filter((t) => t.startSecs >= from && t.startSecs <= to);
    const base = bt.trips?.[0] ? bt.trips[0].start - bt.trips[0].startSecs : 0;
    onChange({ ...b, startSecs: from, endSecs: to, _end: ts.length ? ts[ts.length - 1].end - base : undefined,
      _label: ts.length ? `${ts.length} trip${ts.length === 1 ? "" : "s"} · ${tripName(ts[0])}${ts.length > 1 ? " …" : ""}` : "" });
  }
  const opt = (t) => <option key={t.trip} value={t.startSecs}>{fmtTime(t.start)} · {tripName(t)}</option>;
  return (
    <>
      <div className="bb-line">
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase().trim())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onChange({ ...b, block: input, startSecs: undefined, endSecs: undefined }); } }}
          placeholder="Block, e.g. C01-31" aria-label="Block" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button type="button" className="acct-btn" disabled={!input || input === b.block} onClick={() => onChange({ ...b, block: input, startSecs: undefined, endSecs: undefined })}>Load</button>
      </div>
      {bt.error && <div className="auth-error">{bt.error}</div>}
      {b.block && !bt.trips && <p className="muted bb-small">Loading block {b.block}…</p>}
      {bt.trips?.length > 0 && (
        <>
          <div className="bb-line">
            <label><span>From</span><select value={b.startSecs ?? ""} onChange={(e) => sync(Number(e.target.value), Math.max(Number(e.target.value), b.endSecs ?? 0))}>{bt.trips.map(opt)}</select></label>
          </div>
          <div className="bb-line">
            <label><span>To</span><select value={b.endSecs ?? ""} onChange={(e) => sync(b.startSecs ?? 0, Number(e.target.value))}>{bt.trips.filter((t) => t.startSecs >= (b.startSecs ?? 0)).map(opt)}</select></label>
          </div>
          {b._label && <p className="bb-small">{b._label}</p>}
        </>
      )}
    </>
  );
}

function BlockCard({ b, i, n, prevEnd, onChange, onMove, onRemove, defaultFrom }) {
  const k = kindOf(b.type);
  const start = startOf(b);
  const outOfOrder = prevEnd != null && start != null && start < prevEnd - 60;
  return (
    <li className={`bb-card ${k.cls}`}>
      <div className="bb-card-head">
        <span className="bb-card-kind">{b.type === "break" ? `Break (${b.paid ? "paid" : "unpaid"})` : k.label}</span>
        {b.type !== "trips" && (
          <input type="time" value={toHHMM(b.secs)} onChange={(e) => onChange({ ...b, secs: fromHHMM(e.target.value) })} aria-label={`${k.label} time`} />
        )}
        {b.type === "trips" && start != null && <span className="bb-card-time">{to12(start)} – {to12(endOf(b))}</span>}
        <span className="bb-card-tools">
          <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
          <button type="button" onClick={() => onMove(i, 1)} disabled={i === n - 1} aria-label="Move down">▼</button>
          <button type="button" onClick={() => onRemove(i)} aria-label="Remove">✕</button>
        </span>
      </div>
      {b.type === "trips" ? (
        <TripsCard b={b} onChange={onChange} defaultFrom={defaultFrom} />
      ) : (
        <div className="bb-line">
          <input value={b.place || ""} onChange={(e) => onChange({ ...b, place: e.target.value.slice(0, 50) })}
            list={b.type === "deadhead" ? undefined : "bb-garages"} placeholder={b.type === "deadhead" ? "From where, e.g. Sullivan Square" : "Where, e.g. Fellsway Garage"} aria-label="Place" />
          {b.type === "break" && (
            <>
              <input type="number" min="1" max="600" value={b.mins ?? 30} onChange={(e) => onChange({ ...b, mins: Number(e.target.value) })} aria-label="Minutes" className="bb-mins" />
              <span className="bb-small">min</span>
              <label className="bb-check"><input type="checkbox" checked={!!b.paid} onChange={(e) => onChange({ ...b, paid: e.target.checked })} /> Paid</label>
            </>
          )}
        </div>
      )}
      {outOfOrder && <p className="bb-warn">This starts before the block above ends.</p>}
    </li>
  );
}

export function RunBuilder({ data, vehicle, onDone, onCancel }) {
  const existing = data.runDef;
  const [run, setRun] = useState(existing?.run || "");
  const [autoName, setAutoName] = useState(!existing); // keep suggesting until the user types their own
  const [blocks, setBlocks] = useState(() => {
    const items = (existing?.items || []).map((x) => ({ ...x, key: newKey() }));
    return items.sort((a, b) => (startOf(a) ?? 0) - (startOf(b) ?? 0));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cur = data.trips?.find((t) => t.trip === data.trip);

  const firstTrips = blocks.find((b) => b.type === "trips" && b.startSecs != null);
  const nameBlock = blocks.find((b) => b.type === "trips" && b.block)?.block || vehicle.block || data.block || "";
  const suggest = useCallback(async () => {
    try {
      const r = await fetch(`/api/rundefs?suggest=1&block=${encodeURIComponent(nameBlock)}`, { cache: "no-store" });
      const d = await r.json();
      if (d.run) setRun(d.run);
    } catch {}
  }, [nameBlock]);
  // New runs get a random MBTA-style number for their garage; re-suggest if the first block's garage changes
  const garage = nameBlock.match(/^[A-Z]/i)?.[0] || "";
  useEffect(() => { if (autoName) suggest(); }, [garage, autoName]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastEnd = () => { for (let j = blocks.length - 1; j >= 0; j--) { const e = endOf(blocks[j]); if (e != null) return e; } return null; };

  function add(type) {
    const b = { type, key: newKey() };
    const end = lastEnd();
    const firstStart = firstTrips?.startSecs ?? null;
    if (type === "trips") { b.block = vehicle.block || data.block || ""; if (blocks.some((x) => x.type === "trips")) b.block = ""; }
    else if (type === "report") b.secs = firstStart != null ? firstStart - 30 * 60 : null;
    else if (type === "pullout") { const rep = blocks.find((x) => x.type === "report"); b.secs = rep?.secs != null ? rep.secs + 15 * 60 : firstStart != null ? firstStart - 15 * 60 : null; }
    else if (type === "done") b.secs = end != null ? end + 15 * 60 : null;
    else b.secs = end;
    if (type === "break") { b.mins = 30; b.paid = false; }
    if (["pullout", "pullback", "report", "done", "break"].includes(type)) b.place = blocks.find((x) => x.place && /garage/i.test(x.place))?.place || "";
    // Report and pull out go at the top; everything else stacks at the bottom
    if (type === "report") setBlocks([b, ...blocks]);
    else if (type === "pullout") { const at = blocks[0]?.type === "report" ? 1 : 0; setBlocks([...blocks.slice(0, at), b, ...blocks.slice(at)]); }
    else setBlocks([...blocks, b]);
  }
  const change = (i) => (nb) => setBlocks((bs) => bs.map((x, j) => (j === i ? nb : x)));
  const move = (i, d) => setBlocks((bs) => { const a = [...bs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const remove = (i) => setBlocks((bs) => bs.filter((_, j) => j !== i));

  // Live totals, like the run summary
  const known = blocks.filter((b) => startOf(b) != null && endOf(b) != null);
  const total = known.length ? Math.max(...known.map(endOf)) - Math.min(...known.map(startOf)) : 0;
  const brk = (paid) => blocks.filter((b) => b.type === "break" && !!b.paid === paid).reduce((a, b) => a + (b.mins || 0) * 60, 0);
  const ready = run.trim() && blocks.some((b) => b.type === "trips" && b.block && b.startSecs != null) && blocks.every((b) => (b.type === "trips" ? b.block && b.startSecs != null : b.secs != null));

  async function save() {
    setBusy(true); setError("");
    const items = blocks.map(({ key, _end, _label, ...x }) => x);
    try {
      const r = await fetch("/api/rundefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existing?.id, run, items }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't save the run."); return; }
      onDone();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }
  async function del() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/rundefs?id=${encodeURIComponent(existing.id)}`, { method: "DELETE" });
      if (!r.ok) { setError("Couldn't delete the run."); return; }
      onDone();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }

  return (
    <div className="rb bb">
      <div className="rb-head">{existing ? `Edit run ${existing.run}` : "Build a run"}</div>
      <label className="rb-field"><span>Run number</span>
        <div className="bb-line">
          <input value={run} onChange={(e) => { setAutoName(false); setRun(e.target.value.toUpperCase().slice(0, 16)); }} placeholder="e.g. 126-1411" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <button type="button" className="acct-btn" onClick={suggest} title="Pick another random run number for this garage">New number</button>
        </div>
      </label>

      <div className="bb-palette" role="toolbar" aria-label="Add a block">
        {KINDS.map((k) => (
          <button key={k.type} type="button" className={`bb-chip ${k.cls}`} onClick={() => add(k.type)}>+ {k.label}</button>
        ))}
      </div>

      {!blocks.length && <p className="muted bb-empty">Tap blocks above to stack up the operator&apos;s day, e.g. Report → Pull out → Trips → Break → Trips → Pull back → Done.</p>}
      <ol className="bb-stack">
        {blocks.map((b, i) => (
          <BlockCard key={b.key} b={b} i={i} n={blocks.length} prevEnd={i > 0 ? endOf(blocks[i - 1]) : null}
            onChange={change(i)} onMove={move} onRemove={remove} defaultFrom={cur ? cur.startSecs : null} />
        ))}
      </ol>
      <datalist id="bb-garages">{GARAGES.map((g) => <option key={g} value={g} />)}</datalist>

      {blocks.length > 0 && (
        <dl className="bs-summary bb-summary">
          <dt>Paid break</dt><dd>{hm(brk(true))}</dd>
          <dt>Working hours</dt><dd>{hm(total - brk(false))}</dd>
          <dt>Total hours</dt><dd>{hm(total)}</dd>
        </dl>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="rb-actions">
        <button className="acct-btn acct-btn--primary" disabled={busy || !ready} onClick={save}>{busy ? "Saving…" : "Save run"}</button>
        <button className="acct-btn" onClick={onCancel}>Cancel</button>
        {existing && (confirmDelete
          ? <button className="acct-btn acct-btn--danger" disabled={busy} onClick={del}>Confirm delete</button>
          : <button className="acct-btn acct-btn--ghost" onClick={() => setConfirmDelete(true)}>Delete run</button>)}
      </div>
      <p className="muted rb-help">Saved for every day these blocks run this schedule season. Anyone signed in can edit it.</p>
    </div>
  );
}
