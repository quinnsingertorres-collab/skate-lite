"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CloseIcon, PencilIcon, SearchIcon } from "@/components/Icons";

export default function RoutePicker({ routes, selected, onToggle, open, onOpenChange, loading, presets = [], onOpenPreset, onDeletePreset, onRenamePreset }) {
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [tab, setTab] = useState("routes");
  const f = filter.trim().toLowerCase();
  const shown = f ? routes.filter((r) => r.name.toLowerCase().includes(f) || r.long.toLowerCase().includes(f)) : routes;
  const nameOf = (id) => routes.find((r) => r.id === id)?.name || id;

  return (
    <>
      <div className={`picker-backdrop${open ? " is-open" : ""}`} onClick={() => onOpenChange(false)} />
      <aside className={`picker${open ? " is-open" : ""}`} aria-label="Route picker">
        <div className="picker-inner">
          <div className="picker-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "routes"} className={`picker-tab${tab === "routes" ? " picker-tab--active" : ""}`} onClick={() => setTab("routes")}>Routes</button>
            <button role="tab" aria-selected={tab === "presets"} className={`picker-tab${tab === "presets" ? " picker-tab--active" : ""}`} onClick={() => setTab("presets")}>Presets</button>
          </div>
          {tab === "presets" ? (
            <div className="presets">
              {presets.length === 0 && (
                <p className="picker-hint">No presets yet. Pick some routes, then use the save icon on the tab to save them as a preset.</p>
              )}
              <ul>
                {presets.map((p) => (
                  <li key={p.id} className="preset">
                    {renaming === p.id ? (
                      <input
                        className="preset-name-input"
                        autoFocus
                        defaultValue={p.name}
                        maxLength={60}
                        aria-label="Preset name"
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { onRenamePreset(p.id, e.currentTarget.value); setRenaming(null); }
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        onBlur={(e) => { onRenamePreset(p.id, e.currentTarget.value); setRenaming(null); }}
                      />
                    ) : (
                      <button className="preset-open" onClick={() => onOpenPreset(p)}>
                        <b>{p.name}</b>
                        <span>{p.routes.map((id) => routes.find((r) => r.id === id)?.name || id).join(", ")}</span>
                      </button>
                    )}
                    <button className="preset-edit" onClick={() => setRenaming(p.id)} aria-label={`Rename preset ${p.name}`}><PencilIcon size={13} /></button>
                    <button className="preset-delete" onClick={() => onDeletePreset(p.id)} aria-label={`Delete preset ${p.name}`}><CloseIcon size={12} /></button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
          <>
          <label className="picker-search">
            <SearchIcon size={14} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search routes" aria-label="Search routes" />
            {filter && (
              <button onClick={() => setFilter("")} aria-label="Clear search"><CloseIcon size={10} /></button>
            )}
          </label>
          <div className="picker-columns">
            <ul className="picker-all">
              {loading && <li className="picker-empty">Loading…</li>}
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    className={`picker-route${selected.includes(r.id) ? " is-selected" : ""}`}
                    onClick={() => onToggle(r.id)}
                    title={r.long}
                  >
                    {r.name}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="picker-selected">
              {selected.length === 0 && <li className="picker-hint">Selected routes will show up here…</li>}
              {selected.map((id) => (
                <li key={id}>
                  <button className="picker-selected-route" onClick={() => onToggle(id)} aria-label={`Remove route ${nameOf(id)}`}>
                    {nameOf(id)}
                    <span><CloseIcon size={10} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          </>
          )}
        </div>
        <button className="drawer-tab" onClick={() => onOpenChange(!open)} aria-label={open ? "Hide route picker" : "Show route picker"} aria-expanded={open}>
          {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>
    </>
  );
}
