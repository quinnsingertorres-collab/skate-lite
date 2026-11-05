"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, ClockIcon, LadderIcon, MapIcon, MapSearchIcon, MenuIcon, RefreshIcon } from "@/components/Icons";

const VIEWS = [
  { id: "ladders", label: "Route Ladders", short: "Routes", Icon: LadderIcon, MobileIcon: LadderIcon },
  { id: "late", label: "Late View", short: "Late", Icon: ClockIcon, MobileIcon: ClockIcon, sub: true },
  { id: "map", label: "Search Map", short: "Search", Icon: MapIcon, MobileIcon: MapSearchIcon },
];

async function signOut() {
  await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
  window.location.href = "/signin";
}

// First letter of the person's name (falls back to the end of their ID if no name is set)
function initial(me) {
  const letter = String(me.name || "").trim().match(/\p{L}|\p{N}/u)?.[0];
  return letter ? letter.toUpperCase() : String(me.id).slice(-2);
}

function SwiftlyStatus({ swiftly }) {
  if (!swiftly?.status || swiftly.status === "off") return null;
  return (
    <span
      className={`swiftly-status${swiftly.status === "ok" ? " is-ok" : " is-error"}`}
      title={swiftly.status === "ok" ? "Swiftly connected" : `Swiftly ${swiftly.status}${swiftly.detail ? `: ${swiftly.detail}` : ""}`}
    >
      Swiftly {swiftly.status === "ok" ? "✓" : String(swiftly.status).replace("error ", "")}
    </span>
  );
}

// Your operator ID (attached to runs you publish as the operator)
function OperatorId({ me, onMe }) {
  const [val, setVal] = useState(me?.operatorId || "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(me?.operatorId || ""); }, [me?.operatorId]);
  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operatorId: val }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(d.error || "Couldn't save.");
      else { setMsg(d.operatorId ? "Saved." : "Removed."); onMe?.({ ...me, operatorId: d.operatorId }); }
    } catch { setMsg("Couldn't reach the server."); } finally { setBusy(false); }
  }
  return (
    <form className="mm-op" onSubmit={save}>
      <label htmlFor="mm-op-input">Operator ID</label>
      <div className="mm-op-row">
        <input id="mm-op-input" value={val} onChange={(e) => setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12))}
          placeholder="e.g. 12345" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <button className="acct-btn" disabled={busy || val === (me?.operatorId || "")}>Save</button>
      </div>
      {msg && <small>{msg}</small>}
    </form>
  );
}

// Account menu (hamburger on phones, avatar on desktop): account, operator ID, live status, refresh, sign out
function MobileMenu({ open, onClose, me, onMe, liveText, stale, swiftly, onRefresh }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="mm-backdrop" onClick={onClose}>
      <div className="mm" ref={ref} role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="mm-head">
          <div className="logo">skate</div>
          {me && (
            <div className="mm-user">
              <span className="avatar-id">{initial(me)}</span>
              <span>
                <b>{me.name || "Signed in"}</b>
                <small>ID {me.id}</small>
              </span>
            </div>
          )}
        </div>
        {me && <OperatorId me={me} onMe={onMe} />}
        <div className="mm-status">
          <span className={`live${stale ? " is-stale" : ""}`}><i />{liveText}</span>
          <SwiftlyStatus swiftly={swiftly} />
        </div>
        <button className="mm-item" onClick={() => { onRefresh(); onClose(); }}><RefreshIcon size={18} /> Refresh data</button>
        <button className="mm-item mm-item--danger" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}

export function TopNav({ liveText, stale, onRefresh, swiftly, me, onMe, title }) {
  const [menu, setMenu] = useState(false);
  return (
    <header className="top-nav">
      {/* Desktop */}
      <div className="logo top-desk" aria-label="skate">skate</div>
      <div className="top-nav-right top-desk">
        <SwiftlyStatus swiftly={swiftly} />
        <span className={`live${stale ? " is-stale" : ""}`}>
          <i />
          {liveText}
        </span>
        <button className="icon-btn" onClick={onRefresh} aria-label="Refresh data" title="Refresh">
          <RefreshIcon size={20} />
        </button>
        {me && (
          <button className="avatar" onClick={() => setMenu(true)} title={`Signed in as ${me.name ? `${me.name} (${me.id})` : me.id}`} aria-label="Account menu">
            <span className="avatar-id">{initial(me)}</span>
            <span className="avatar-out">Account</span>
          </button>
        )}
      </div>

      {/* Phones: menu · title · refresh */}
      <button className="top-mob-btn top-mob" onClick={() => setMenu(true)} aria-label="Menu">
        <MenuIcon size={24} />
      </button>
      <div className="top-mob-title top-mob">{title}</div>
      <button className={`top-mob-btn top-mob${stale ? " is-stale" : ""}`} onClick={onRefresh} aria-label="Refresh data">
        <RefreshIcon size={22} />
      </button>
      <MobileMenu open={menu} onClose={() => setMenu(false)} me={me} onMe={onMe} liveText={liveText} stale={stale} swiftly={swiftly} onRefresh={onRefresh} />
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
      {VIEWS.map(({ id, short, MobileIcon }) => (
        <button key={id} className={`bottom-nav-link${view === id ? " is-active" : ""}`} onClick={() => onView(id)} aria-current={view === id ? "page" : undefined}>
          <span className="bn-icon"><MobileIcon size={24} strokeWidth={1.7} /></span>
          <span className="bn-label">{short}</span>
        </button>
      ))}
    </nav>
  );
}

export const VIEW_LABELS = Object.fromEntries(VIEWS.map((v) => [v.id, v.label]));
