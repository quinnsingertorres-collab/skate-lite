"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Ladder from "@/components/Ladder";
import VehiclePanel from "@/components/VehiclePanel";
import RoutePicker from "@/components/RoutePicker";
import SearchMap from "@/components/SearchMap";
import LateView from "@/components/LateView";
import { BottomNav, LeftNav, TopNav } from "@/components/Nav";
import { CloseIcon, PlusIcon, SaveIcon } from "@/components/Icons";
import { useLadderTabs } from "@/lib/useLadderTabs";

const NAV_KEY = "skate-lite:nav-collapsed";
const POLL_MS = 10000;
const VIEWS = ["ladders", "late", "map"];

function NameInput({ initial, placeholder, onDone, onCancel, label }) {
  const [val, setVal] = useState(initial || "");
  return (
    <input
      className="tab-name-input"
      autoFocus
      value={val}
      placeholder={placeholder}
      aria-label={label}
      maxLength={60}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(val);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onDone(val)}
    />
  );
}

function TabBar({ tabs, current, isDirty, onSelect, onClose, onAdd, onSave, onRename }) {
  // editing: { id, mode: "save" | "rename" }
  const [editing, setEditing] = useState(null);
  const finish = (t, mode) => (name) => {
    setEditing(null);
    if (mode === "save") onSave(name);
    else if (name.trim()) onRename(t.id, name);
  };
  return (
    <div className="tab-bar" role="tablist" aria-label="Route ladder tabs">
      {tabs.map((t) => {
        const active = t.id === current?.id;
        const isEditing = editing?.id === t.id;
        return (
          <div key={t.id} className={`tab${active ? " tab--current" : ""}${isEditing ? " tab--editing" : ""}`}>
            {isEditing ? (
              <NameInput
                initial={editing.mode === "save" && t.title === "Untitled" ? t.routes.join(", ") : t.title}
                placeholder="Preset name"
                label={editing.mode === "save" ? "Name this preset" : "Rename tab"}
                onDone={finish(t, editing.mode)}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button
                role="tab"
                aria-selected={active}
                className="tab-title"
                onClick={() => onSelect(t.id)}
                onDoubleClick={() => setEditing({ id: t.id, mode: "rename" })}
                title={`${t.title} (double-click to rename)`}
              >
                {t.title}{active && isDirty ? " *" : ""}
              </button>
            )}
            {active && !isEditing && (
              <button
                className="tab-icon"
                onClick={() => (t.presetId ? onSave() : setEditing({ id: t.id, mode: "save" }))}
                disabled={!t.routes.length}
                aria-label={t.presetId ? "Update preset" : "Save as preset"}
                title={t.presetId ? "Update preset" : "Save as preset"}
              >
                <SaveIcon size={13} />
              </button>
            )}
            <button className="tab-icon" onClick={() => onClose(t.id)} aria-label={`Close tab ${t.title}`}>
              <CloseIcon size={11} />
            </button>
          </div>
        );
      })}
      <button className="tab-add" onClick={onAdd} aria-label="New tab" title="New tab">
        <PlusIcon size={14} />
      </button>
    </div>
  );
}

export default function Home() {
  const [index, setIndex] = useState(null);
  const [routeData, setRouteData] = useState({});
  const [feed, setFeed] = useState({ vehicles: [], fetched: null, error: null, sources: {} });
  const [selVehicleId, setSelVehicleId] = useState(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [view, setView] = useState("ladders");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const t = useLadderTabs();
  const selected = t.selected;

  const loadRoute = useCallback((id) => {
    if (!id) return;
    fetch(`/data/r/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRouteData((m) => (m[id] ? m : { ...m, [id]: d })));
  }, []);

  useEffect(() => {
    fetch("/data/routes.json").then((r) => r.json()).then(setIndex);
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (VIEWS.includes(v)) setView(v);
    try { setNavCollapsed(localStorage.getItem(NAV_KEY) === "1"); } catch {}

    // No pinch/double-tap zoom of the page on phones (maps still zoom on their own)
    const stop = (e) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);

  // Open the picker on first load only if the current tab is empty (or on wide screens)
  useEffect(() => {
    if (!t.ready) return;
    const narrow = window.matchMedia("(max-width: 800px), (max-height: 500px)").matches;
    setPickerOpen(!narrow || t.selected.length === 0);
  }, [t.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!t.ready) return;
    const url = new URL(window.location.href);
    if (selected.length) url.searchParams.set("r", selected.join(",")); else url.searchParams.delete("r");
    if (view !== "ladders") url.searchParams.set("view", view); else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
    selected.forEach(loadRoute);
  }, [selected, view, t.ready, loadRoute]);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/vehicles", { cache: "no-store" });
      const d = await r.json();
      setFeed({ vehicles: d.vehicles || [], fetched: d.fetched, error: d.error || null, sources: d.sources || {} });
    } catch (e) {
      setFeed((f) => ({ ...f, error: String(e) }));
    }
  }, []);

  useEffect(() => {
    poll();
    const a = setInterval(poll, POLL_MS);
    const b = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [poll]);

  const byRoute = useMemo(() => {
    const m = {};
    for (const v of feed.vehicles) if (v.route) (m[v.route] ||= []).push(v);
    return m;
  }, [feed.vehicles]);

  // Late View needs stop names for whichever routes have late buses
  useEffect(() => {
    if (view !== "late") return;
    new Set(feed.vehicles.filter((v) => v.adherence > 360 && v.route).map((v) => v.route)).forEach(loadRoute);
  }, [view, feed.vehicles, loadRoute]);

  const selVehicle = feed.vehicles.find((v) => v.id === selVehicleId) || null;
  const selRoute = selVehicle?.route ? routeData[selVehicle.route] : null;

  const openVehicle = useCallback((v) => {
    setSelVehicleId(v.id);
    loadRoute(v.route);
  }, [loadRoute]);

  const collapseNav = () => setNavCollapsed((c) => {
    try { localStorage.setItem(NAV_KEY, c ? "0" : "1"); } catch {}
    return !c;
  });

  const routes = index?.routes || [];
  const stale = !!feed.error || (feed.fetched && now - feed.fetched > 60);
  const liveText = feed.error ? "Live data unavailable" : feed.fetched ? `${feed.vehicles.length} buses` : "Connecting…";

  return (
    <div className="app">
      <TopNav liveText={liveText} stale={stale} onRefresh={poll} swiftly={{ status: feed.sources.swiftly, detail: feed.sources.swiftlyDetail }} />
      <LeftNav view={view} onView={setView} collapsed={navCollapsed} onCollapse={collapseNav} />

      <main className="content">
        {view === "ladders" && (
          <div className={`ladder-page${pickerOpen ? " picker-visible" : ""}`}>
            <RoutePicker
              routes={routes}
              selected={selected}
              onToggle={t.toggleRoute}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              loading={!index}
              presets={t.presets}
              onOpenPreset={t.openPreset}
              onDeletePreset={t.deletePreset}
              onRenamePreset={t.renamePreset}
            />
            <div className="ladder-main">
              <TabBar
                tabs={t.tabs}
                current={t.current}
                isDirty={t.isDirty}
                onSelect={t.selectTab}
                onClose={t.closeTab}
                onAdd={t.addTab}
                onSave={t.saveCurrentAsPreset}
                onRename={t.renameTab}
              />
              <div className="route-ladders">
                {selected.length === 0 && (
                  <div className="ladders-empty">
                    <p>Select routes from the route picker to see their ladders.</p>
                    <p className="legend">
                      <i className="early" /> Early <i className="ontime" /> On time <i className="late" /> Late
                    </p>
                  </div>
                )}
                {selected.map((id) =>
                  routeData[id] ? (
                    <Ladder
                      key={id}
                      route={routeData[id]}
                      vehicles={byRoute[id] || []}
                      selectedId={selVehicleId}
                      onSelect={openVehicle}
                      onRemove={() => t.toggleRoute(id)}
                    />
                  ) : (
                    <section key={id} className="rl rl--loading">Loading {id}…</section>
                  )
                )}
              </div>
            </div>
          </div>
        )}
        {view === "late" && (
          <LateView vehicles={feed.vehicles} routes={routes} routeData={routeData} selectedRoutes={selected} selectedId={selVehicleId} onSelect={openVehicle} />
        )}
        {view === "map" && (
          <SearchMap vehicles={feed.vehicles} routes={routes} routeData={routeData} selectedId={selVehicleId} onSelect={openVehicle} />
        )}
      </main>

      <BottomNav view={view} onView={setView} />

      {selVehicle && <VehiclePanel vehicle={selVehicle} route={selRoute} now={now} onClose={() => setSelVehicleId(null)} />}
    </div>
  );
}
