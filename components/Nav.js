"use client";
import { ChevronsLeft, ChevronsRight, ClockIcon, LadderIcon, MapIcon, RefreshIcon } from "@/components/Icons";

const VIEWS = [
  { id: "ladders", label: "Route Ladders", Icon: LadderIcon },
  { id: "late", label: "Late View", Icon: ClockIcon, sub: true },
  { id: "map", label: "Search Map", Icon: MapIcon },
];

export function TopNav({ liveText, stale, onRefresh, swiftly }) {
  return (
    <header className="top-nav">
      <div className="logo" aria-label="sk8">sk8</div>
      <div className="top-nav-right">
        {swiftly?.status && swiftly.status !== "off" && (
          <span
            className={`swiftly-status${swiftly.status === "ok" ? " is-ok" : " is-error"}`}
            title={swiftly.status === "ok" ? "Swiftly connected" : `Swiftly ${swiftly.status}${swiftly.detail ? `: ${swiftly.detail}` : ""}`}
          >
            Swiftly {swiftly.status === "ok" ? "✓" : String(swiftly.status).replace("error ", "")}
          </span>
        )}
        <span className={`live${stale ? " is-stale" : ""}`}>
          <i />
          {liveText}
        </span>
        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh data" title="Refresh">
          <RefreshIcon size={20} />
        </button>
      </div>
    </header>
  );
}

export function LeftNav({ view, onView, collapsed, onCollapse }) {
  return (
    <nav className={`left-nav${collapsed ? " is-collapsed" : ""}`} aria-label="Main">
      <div className="left-nav-links">
        {VIEWS.map(({ id, label, Icon, sub }) => (
          <button
            key={id}
            className={`left-nav-link${sub ? " left-nav-link--sub" : ""}${view === id ? " is-active" : ""}`}
            onClick={() => onView(id)}
            aria-current={view === id ? "page" : undefined}
            title={label}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="left-nav-links">
        <button className="left-nav-link" onClick={onCollapse} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          <span>Collapse</span>
        </button>
      </div>
    </nav>
  );
}

export function BottomNav({ view, onView }) {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {VIEWS.map(({ id, label, Icon }) => (
        <button key={id} className={`bottom-nav-link${view === id ? " is-active" : ""}`} onClick={() => onView(id)} aria-current={view === id ? "page" : undefined}>
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
