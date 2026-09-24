"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Ladder from "@/components/Ladder";
import VehiclePanel from "@/components/VehiclePanel";
import RoutePicker from "@/components/RoutePicker";
import SearchMap from "@/components/SearchMap";
import { BottomNav, LeftNav, TopNav } from "@/components/Nav";

const STORE_KEY = "skate-lite:routes";
const NAV_KEY = "skate-lite:nav-collapsed";
const POLL_MS = 10000;

function readSaved() {
  try {
    const q = new URLSearchParams(window.location.search).get("r");
    if (q) return q.split(",").filter(Boolean);
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function Home() {
  const [index, setIndex] = useState(null);
  const [selected, setSelected] = useState([]);
  const [routeData, setRouteData] = useState({});
  const [feed, setFeed] = useState({ vehicles: [], fetched: null, error: null, sources: {} });
  const [selVehicleId, setSelVehicleId] = useState(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [view, setView] = useState("ladders");
  const [pickerOpen, setPickerOpen] = useState(true);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  const loadRoute = useCallback((id) => {
    if (!id) return;
    fetch(`/data/r/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRouteData((m) => (m[id] ? m : { ...m, [id]: d })));
  }, []);

  useEffect(() => {
    fetch("/data/routes.json").then((r) => r.json()).then(setIndex);
    const saved = readSaved();
    setSelected(saved);
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "map") setView("map");
    const narrow = window.matchMedia("(max-width: 800px), (max-height: 500px)").matches;
    setPickerOpen(saved.length === 0 || !narrow);
    try { setNavCollapsed(localStorage.getItem(NAV_KEY) === "1"); } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(selected)); } catch {}
    const url = new URL(window.location.href);
    if (selected.length) url.searchParams.set("r", selected.join(",")); else url.searchParams.delete("r");
    if (view === "map") url.searchParams.set("view", "map"); else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
    selected.forEach(loadRoute);
  }, [selected, view, ready, loadRoute]);

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

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
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
  const swiftlyOk = feed.sources.swiftly === "ok";

  return (
    <div className="app">
      <TopNav liveText={liveText} stale={stale} onRefresh={poll} />
      <LeftNav view={view} onView={setView} collapsed={navCollapsed} onCollapse={collapseNav} />

      <main className="content">
        {view === "ladders" ? (
          <div className={`ladder-page${pickerOpen ? " picker-visible" : ""}`}>
            <RoutePicker
              routes={routes}
              selected={selected}
              onToggle={toggle}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              loading={!index}
            />
            <div className="route-ladders">
              {selected.length === 0 && (
                <div className="ladders-empty">
                  <p>Select routes from the route picker to see their ladders.</p>
                  {swiftlyOk && (
                    <p className="legend">
                      <i className="early" /> Early <i className="ontime" /> On time <i className="late" /> Late
                    </p>
                  )}
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
                    onRemove={() => toggle(id)}
                  />
                ) : (
                  <section key={id} className="rl rl--loading">Loading {id}…</section>
                )
              )}
            </div>
          </div>
        ) : (
          <SearchMap vehicles={feed.vehicles} routes={routes} routeData={routeData} selectedId={selVehicleId} onSelect={openVehicle} />
        )}
      </main>

      <BottomNav view={view} onView={setView} />

      {selVehicle && <VehiclePanel vehicle={selVehicle} route={selRoute} now={now} onClose={() => setSelVehicleId(null)} />}
    </div>
  );
}
