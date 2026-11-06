"use client";
// Operator roster (names + operator IDs) and their weekly schedules. Roster access only.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloseIcon } from "@/components/Icons";

const DAY_SHORT = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function OperatorForm({ initial, onSave, onCancel, busy }) {
  const [id, setId] = useState(initial?.operatorId || "");
  const [name, setName] = useState(initial?.name || "");
  return (
    <form className="ro-form" onSubmit={(e) => { e.preventDefault(); onSave({ operatorId: id, name, oldId: initial?.operatorId }); }}>
      <input value={name} onChange={(e) => setName(e.target.value.toUpperCase().slice(0, 60))} placeholder="NAME" aria-label="Operator name" autoFocus={!initial} />
      <input value={id} onChange={(e) => setId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12))} placeholder="Operator ID" aria-label="Operator ID"
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      <button className="acct-btn acct-btn--primary" disabled={busy || !id || !name.trim()}>{initial ? "Save" : "Add operator"}</button>
      {onCancel && <button type="button" className="acct-btn" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function ScheduleEditor({ op, runs, today, onSaved, setError }) {
  const [days, setDays] = useState(op.days || {});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(days) !== JSON.stringify(op.days || {});
  useEffect(() => { setDays(op.days || {}); }, [op.operatorId, JSON.stringify(op.days)]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/roster/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorId: op.operatorId, days }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || "Couldn't save the schedule."); else onSaved();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }
  return (
    <div className="ro-sched">
      {ORDER.map((d) => (
        <label key={d} className={d === today ? "is-today" : ""}>
          <span>{DAY_SHORT[d]}{d === today ? " (today)" : ""}</span>
          <select value={days[d] || ""} onChange={(e) => setDays({ ...days, [d]: e.target.value || undefined })}>
            <option value="">Off</option>
            {runs.map((r) => <option key={r.id} value={r.id}>Run {r.run}</option>)}
          </select>
        </label>
      ))}
      <div className="ro-actions">
        <button className="acct-btn acct-btn--primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save schedule"}</button>
        {!runs.length && <span className="muted">Build runs first (Run tab or schedule search) to assign them.</span>}
      </div>
    </div>
  );
}

export default function RosterPanel({ vehicles, onClose, onOpenVehicle, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);      // operatorId being viewed
  const [editing, setEditing] = useState(null); // operatorId being renamed
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/roster", { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setData(d); } else setError(d.error || "Couldn't load the roster."); })
      .catch(() => setError("Couldn't reach the server."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const runName = useMemo(() => new Map((data?.runs || []).map((r) => [r.id, r.run])), [data]);
  const list = (data?.operators || []).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()) || o.operatorId.toLowerCase().includes(q.toLowerCase()));

  async function saveOp(op) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't save."); return; }
      setAdding(false); setEditing(null); load(); onChanged?.();
    } catch { setError("Couldn't reach the server."); } finally { setBusy(false); }
  }
  async function removeOp(id) {
    setBusy(true); setError("");
    try { await fetch(`/api/roster?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setOpen(null); load(); onChanged?.(); }
    finally { setBusy(false); }
  }

  return (
    <aside className="pp" aria-label="Operators">
      <div className="pp-bar"><span /><h2>Operators</h2><button className="pp-close" onClick={onClose} aria-label="Close"><CloseIcon size={22} /></button></div>
      <div className="sp-head">
        <div className="sp-title">Operators &amp; schedules</div>
        <div className="sp-sub muted">
          {data ? `${data.operators.length} operator${data.operators.length === 1 ? "" : "s"} · ${data.season || "this"} schedule season` : "Loading…"}
        </div>
        <p className="muted ro-note">Only people with roster access can see this. Everything here resets when the MBTA publishes a new season&apos;s bus schedule. Only add operators who are OK with it.</p>
      </div>
      <div className="pp-body ro">
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div className="ro-top">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or ID" aria-label="Search operators" />
          {!adding && <button className="acct-btn acct-btn--primary" onClick={() => setAdding(true)}>Add operator</button>}
        </div>
        {adding && <OperatorForm onSave={saveOp} onCancel={() => setAdding(false)} busy={busy} />}
        {data && !list.length && <p className="muted">{data.operators.length ? "No one matches." : "No operators yet."}</p>}
        <ul className="ro-list">
          {list.map((o) => {
            const todayRun = o.days?.[data.today];
            const bus = todayRun ? vehicles.find((v) => v.runDef?.id === todayRun) : null;
            const isOpen = open === o.operatorId;
            return (
              <li key={o.operatorId} className={isOpen ? "is-open" : ""}>
                {editing === o.operatorId ? (
                  <OperatorForm initial={o} onSave={saveOp} onCancel={() => setEditing(null)} busy={busy} />
                ) : (
                  <button className="ro-row" onClick={() => setOpen(isOpen ? null : o.operatorId)} aria-expanded={isOpen}>
                    <span className="ro-name"><b>{(o.name || "").toUpperCase()}</b> <span className="muted">#{o.operatorId}</span></span>
                    <span className="ro-today">{todayRun ? `Today: Run ${runName.get(todayRun) || "?"}` : "Off today"}{bus ? ` · bus ${bus.label}` : ""}</span>
                  </button>
                )}
                {isOpen && editing !== o.operatorId && (
                  <div className="ro-detail">
                    <ScheduleEditor op={o} runs={data.runs} today={data.today} onSaved={() => { load(); onChanged?.(); }} setError={setError} />
                    <div className="ro-actions">
                      {bus && <button className="acct-btn" onClick={() => onOpenVehicle(bus)}>Open bus {bus.label}</button>}
                      <button className="acct-btn" onClick={() => setEditing(o.operatorId)}>Edit name / ID</button>
                      <button className="acct-btn acct-btn--ghost" disabled={busy} onClick={() => removeOp(o.operatorId)}>Remove</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
