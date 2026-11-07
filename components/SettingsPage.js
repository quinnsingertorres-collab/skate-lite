"use client";
// Settings, like Skate's: how buses are labeled and which color early buses are.
import { useState } from "react";

function Choice({ name, value, options, onChange }) {
  return (
    <div className="set-choices" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={`set-choice${value === o.value ? " is-on" : ""}`}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className="set-radio" aria-hidden="true" />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

export default function SettingsPage({ settings, onChange }) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  async function set(patch) {
    const next = { ...settings, ...patch };
    onChange(next); // apply right away
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      setMsg(r.ok ? "Saved to your account." : "Couldn't save. It'll only last on this device.");
    } catch { setMsg("Couldn't save. It'll only last on this device."); } finally { setSaving(false); }
  }
  return (
    <div className="set-page">
      <h1>Settings</h1>
      <section>
        <h2>Vehicle settings</h2>
        <div className="set-row">
          <div className="set-label">Vehicle labels on ladders and maps</div>
          <Choice name="ladderLabel" value={settings.ladderLabel} onChange={(v) => set({ ladderLabel: v })}
            options={[{ value: "run", label: "Run number" }, { value: "vehicle", label: "Vehicle number" }]} />
          <p className="set-help">Run numbers show when a run has been built for the bus&apos;s trips; otherwise the vehicle number shows. &ldquo;Pull-B&rdquo; marks a bus&apos;s last trip before the garage, and &ldquo;Sw-Off&rdquo; the last trip of a run before another operator takes over.</p>
        </div>
        <div className="set-row">
          <div className="set-label">Adherence colors</div>
          <Choice name="earlyColor" value={settings.earlyColor} onChange={(v) => set({ earlyColor: v })}
            options={[
              { value: "blue", label: <><span className="set-swatch" style={{ background: "#46a5e7" }} />Early bus: Blue <span className="set-swatch" style={{ background: "#e45d32" }} />Late: Red</> },
              { value: "red", label: <><span className="set-swatch" style={{ background: "#e45d32" }} />Early bus: Red <span className="set-swatch" style={{ background: "#46a5e7" }} />Late: Blue</> },
            ]} />
        </div>
      </section>
      <p className="set-msg" role="status">{saving ? "Saving…" : msg}</p>
    </div>
  );
}
