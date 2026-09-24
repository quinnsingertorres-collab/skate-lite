"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CloseIcon, SearchIcon } from "@/components/Icons";

export default function RoutePicker({ routes, selected, onToggle, open, onOpenChange, loading }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const shown = f ? routes.filter((r) => r.name.toLowerCase().includes(f) || r.long.toLowerCase().includes(f)) : routes;
  const nameOf = (id) => routes.find((r) => r.id === id)?.name || id;

  return (
    <>
      <div className={`picker-backdrop${open ? " is-open" : ""}`} onClick={() => onOpenChange(false)} />
      <aside className={`picker${open ? " is-open" : ""}`} aria-label="Route picker">
        <div className="picker-inner">
          <div className="picker-tabs">
            <span className="picker-tab picker-tab--active">Routes</span>
          </div>
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
        </div>
        <button className="drawer-tab" onClick={() => onOpenChange(!open)} aria-label={open ? "Hide route picker" : "Show route picker"} aria-expanded={open}>
          {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>
    </>
  );
}
