"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Ladder from "@/components/Ladder";
import VehiclePanel from "@/components/VehiclePanel";

const STORE_KEY = "skate-lite:routes";
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
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selVehicleId, setSelVehicleId] = useState(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    fetch("/data/routes.json").then((r) => r.json()).then(setIndex);
    setSelected(readSaved());
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(selected)); } catch {}
    const url = new URL(window.location.href);
    if (selected.length) url.searchParams.set("r", selected.join(",")); else url.searchParams.delete("r");
    window.history.replaceState(null, "", url);
    for (const id of selected) {
      if (routeData[id]) continue;
      fetch(`/data/r/${encodeURIComponent(id)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRouteData((m) => ({ ...m, [id]: d })));
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const openVehicle = (v) => {
    setSelVehicleId(v.id);
    setQuery("");
    if (v.route && !routeData[v.route]) {
      fetch(`/data/r/${encodeURIComponent(v.route)}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRouteData((m) => ({ ...m, [v.route]: d })));
    }
  };

  const routes = index?.routes || [];
  const f = filter.trim().toLowerCase();
  const shown = f ? routes.filter((r) => r.name.toLowerCase().includes(f) || r.long.toLowerCase().includes(f)) : routes;
  const matches = query.trim()
    ? feed.vehicles.filter((v) => v.label.toLowerCase().startsWith(query.trim().toLowerCase())).slice(0, 12)
    : [];
  const stale = feed.error || (feed.fetched && now - feed.fetched > 60);

  return (
    <div className="app">
      <header>
        <div className="logo">sk8<span>lite</span></div>
        <span className="meta">
          <span className={`status-dot${stale ? " stale" : ""}`} />
          {feed.error ? "Live data unavailable" : `${feed.vehicles.length} buses live`}
        </span>
        {feed.sources.swiftly === "ok" ? (
          <span className="legend meta">
            <i className="early" />Early <i className="ontime" />On time <i className="late" />Late
          </span>
        ) : feed.sources.swiftly && feed.sources.swiftly !== "off" ? (
          <span className="meta" title="Check SWIFTLY_API_KEY / SWIFTLY_AGENCY">Swiftly: {feed.sources.swiftly}</span>
        ) : null}
        <div className="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bus number…" aria-label="Search bus number" />
          {matches.length > 0 && (
            <div className="results">
              {matches.map((v) => {
                const name = routes.find((r) => r.id === v.route)?.name || v.route || "—";
                return (
                  <button key={v.id} onClick={() => openVehicle(v)}>
                    <b>{v.label}</b> <span className="meta">· route {name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <div className="body">
        <nav className="picker" aria-label="Routes">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search routes" aria-label="Search routes" />
          {selected.length > 0 && (
            <div className="chips">
              {selected.map((id) => (
                <button key={id} className="chip" onClick={() => toggle(id)}>
                  {routes.find((r) => r.id === id)?.name || id} ✕
                </button>
              ))}
            </div>
          )}
          <div className="list">
            {!index && <span className="meta">Loading routes…</span>}
            {shown.map((r) => (
              <button key={r.id} className={selected.includes(r.id) ? "on" : ""} onClick={() => toggle(r.id)}>
                <b>{r.name}</b>
                <small>{(byRoute[r.id]?.length || 0) + " live"}</small>
              </button>
            ))}
          </div>
        </nav>

        <main className="ladders">
          {selected.length === 0 && (
            <p className="empty">Pick routes on the left to see their ladders. Buses move between timepoints in real time.</p>
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
              <section key={id} className="ladder meta" style={{ padding: 16 }}>Loading {id}…</section>
            )
          )}
        </main>
      </div>


      {selVehicle && <VehiclePanel vehicle={selVehicle} route={selRoute} now={now} onClose={() => setSelVehicleId(null)} />}
    </div>
  );
}
