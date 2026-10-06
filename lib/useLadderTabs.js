"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Route-ladder tabs and saved presets, like Skate's tab bar.
// Open tabs are kept on this device; saved presets are kept with your account (/api/presets)
// so they show up on any device you sign in on. A local copy is used if the server can't be reached.
const TABS_KEY = "skate-lite:tabs";
const PRESETS_KEY = "skate-lite:presets";
const SYNCED_IDS_KEY = "skate-lite:presets-synced"; // preset ids this device last saw on the account
const LEGACY_KEY = "skate-lite:routes";

const uid = () => Math.random().toString(36).slice(2, 9);
const newTab = (routes = []) => ({ id: uid(), title: "Untitled", routes, presetId: null });

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function useLadderTabs() {
  const [state, setState] = useState({ tabs: [newTab()], current: null });
  const [presets, setPresets] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved = read(TABS_KEY, null);
    if (!saved?.tabs?.length) {
      const legacy = read(LEGACY_KEY, []);
      const t = newTab(Array.isArray(legacy) ? legacy : []);
      saved = { tabs: [t], current: t.id };
    }
    // A shared link (?r=1,23) opens in its own tab
    const q = new URLSearchParams(window.location.search).get("r");
    if (q) {
      const routes = q.split(",").filter(Boolean);
      const cur = saved.tabs.find((t) => t.id === saved.current);
      const same = cur && cur.routes.join(",") === routes.join(",");
      if (!same) {
        const existing = saved.tabs.find((t) => t.routes.join(",") === routes.join(","));
        if (existing) saved = { ...saved, current: existing.id };
        else if (cur && !cur.routes.length && !cur.presetId) {
          saved = { ...saved, tabs: saved.tabs.map((t) => (t.id === cur.id ? { ...t, routes } : t)) };
        } else {
          const t = newTab(routes);
          saved = { tabs: [...saved.tabs, t], current: t.id };
        }
      }
    }
    if (!saved.tabs.some((t) => t.id === saved.current)) saved.current = saved.tabs[0].id;
    setState(saved);
    setPresets(read(PRESETS_KEY, []));
    setReady(true);
  }, []);

  useEffect(() => { if (ready) write(TABS_KEY, state); }, [state, ready]);
  useEffect(() => { if (ready) write(PRESETS_KEY, presets); }, [presets, ready]);

  // ---- Account sync for presets
  // Local edits are never thrown away by a slower server response: edits made before the
  // first sync are merged in, and a pull that overlaps an edit pushes instead of overwriting.
  const synced = useRef(false);      // server copy has been loaded at least once
  const fromServer = useRef(false);  // skip echoing a server update back to the server
  const dirty = useRef(false);       // local changes not yet saved to the account
  const edits = useRef(0);           // bumps on every local change
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const pushTimer = useRef(null);

  const push = useCallback(async () => {
    const at = edits.current;
    const list = presetsRef.current;
    try {
      const r = await fetch("/api/presets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presets: list }) });
      if (r.ok) {
        write(SYNCED_IDS_KEY, list.map((p) => p.id));
        if (edits.current === at) dirty.current = false;
      }
    } catch {}
  }, []);

  const pull = useCallback(async () => {
    if (dirty.current && synced.current) { push(); return; }
    const at = edits.current;
    try {
      const r = await fetch("/api/presets", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      if (!d.synced) return;
      const server = Array.isArray(d.presets) ? d.presets : [];
      const local = presetsRef.current;
      if (!synced.current) {
        // First sync: keep presets made on this device that never reached the account;
        // drop ones the account no longer has (deleted on another device).
        const known = new Set(read(SYNCED_IDS_KEY, []));
        const onServer = new Set(server.map((p) => p.id));
        const extra = local.filter((p) => !onServer.has(p.id) && !known.has(p.id));
        synced.current = true;
        if (extra.length || !Array.isArray(d.presets)) {
          setPresets([...server, ...extra]); // the push effect uploads the merged list
          return;
        }
      } else if (edits.current !== at || dirty.current) {
        push(); // edited while we were fetching: ours is newer
        return;
      }
      write(SYNCED_IDS_KEY, server.map((p) => p.id));
      dirty.current = false;
      if (JSON.stringify(server) !== JSON.stringify(local)) {
        fromServer.current = true;
        setPresets(server);
      }
    } catch {}
  }, [push]);

  useEffect(() => {
    if (!ready) return;
    pull();
    const onVis = () => { if (document.visibilityState === "visible" && !pushTimer.current) pull(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [ready, pull]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!loadedOnce.current) { loadedOnce.current = true; return; } // the list read from this device on load isn't an edit
    if (fromServer.current) { fromServer.current = false; return; }
    edits.current += 1;
    dirty.current = true;
    if (!synced.current) return; // the first pull merges and uploads these
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => { pushTimer.current = null; push(); }, 400);
  }, [presets, ready, push]);

  // Presets from the account that aren't open in a tab here keep their names in sync
  useEffect(() => {
    if (!ready) return;
    setState((s) => {
      let changed = false;
      const tabs = s.tabs.map((t) => {
        if (!t.presetId) return t;
        const p = presets.find((x) => x.id === t.presetId);
        if (!p) { changed = true; return { ...t, presetId: null }; }
        if (p.name !== t.title) { changed = true; return { ...t, title: p.name }; }
        return t;
      });
      return changed ? { ...s, tabs } : s;
    });
  }, [presets, ready]);

  const current = state.tabs.find((t) => t.id === state.current) || state.tabs[0];
  const selected = current?.routes || [];

  const updateCurrent = useCallback((fn) => {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === s.current ? fn(t) : t)) }));
  }, []);

  const toggleRoute = useCallback(
    (id) => updateCurrent((t) => ({ ...t, routes: t.routes.includes(id) ? t.routes.filter((x) => x !== id) : [...t.routes, id] })),
    [updateCurrent]
  );

  const addTab = useCallback(() => {
    const t = newTab();
    setState((s) => ({ tabs: [...s.tabs, t], current: t.id }));
  }, []);

  const selectTab = useCallback((id) => setState((s) => ({ ...s, current: id })), []);

  const closeTab = useCallback((id) => {
    setState((s) => {
      const i = s.tabs.findIndex((t) => t.id === id);
      let tabs = s.tabs.filter((t) => t.id !== id);
      if (!tabs.length) tabs = [newTab()];
      const current = s.current === id ? (tabs[Math.max(0, i - 1)] || tabs[0]).id : s.current;
      return { tabs, current };
    });
  }, []);

  const saveCurrentAsPreset = useCallback((customName) => {
    if (!current || !current.routes.length) return;
    const typed = String(customName || "").trim().slice(0, 60);
    const name = typed || (current.presetId || current.title !== "Untitled" ? current.title : current.routes.join(", "));
    const presetId = current.presetId || uid();
    setPresets((ps) => {
      const rest = ps.filter((p) => p.id !== presetId);
      return [...rest, { id: presetId, name, routes: current.routes }];
    });
    updateCurrent((t) => ({ ...t, presetId, title: name }));
  }, [current, updateCurrent]);

  // Rename a tab; if it's a saved preset, the preset gets the same name
  const stateRef = useRef(state);
  stateRef.current = state;
  const renameTab = useCallback((id, name) => {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) return;
    // Read the tab now (not inside the state updater, which React may run later)
    const presetId = stateRef.current.tabs.find((t) => t.id === id)?.presetId || null;
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: clean } : t)) }));
    if (presetId) setPresets((ps) => ps.map((p) => (p.id === presetId ? { ...p, name: clean } : p)));
  }, []);

  const renamePreset = useCallback((id, name) => {
    const clean = String(name || "").trim().slice(0, 60);
    if (!clean) return;
    setPresets((ps) => ps.map((p) => (p.id === id ? { ...p, name: clean } : p)));
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.presetId === id ? { ...t, title: clean } : t)) }));
  }, []);

  const openPreset = useCallback((p) => {
    setState((s) => {
      const open = s.tabs.find((t) => t.presetId === p.id);
      if (open) return { ...s, current: open.id };
      const t = { ...newTab(p.routes), title: p.name, presetId: p.id };
      const cur = s.tabs.find((x) => x.id === s.current);
      // Replace an empty untitled tab rather than piling up tabs
      if (cur && !cur.routes.length && !cur.presetId) {
        return { tabs: s.tabs.map((x) => (x.id === cur.id ? { ...t, id: cur.id } : x)), current: cur.id };
      }
      return { tabs: [...s.tabs, t], current: t.id };
    });
  }, []);

  const deletePreset = useCallback((id) => {
    setPresets((ps) => ps.filter((p) => p.id !== id));
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.presetId === id ? { ...t, presetId: null, title: "Untitled" } : t)) }));
  }, []);

  // A tab edited after saving shows as unsaved
  const isDirty = !!current?.presetId && presets.find((p) => p.id === current.presetId)?.routes.join(",") !== current.routes.join(",");

  return {
    ready, tabs: state.tabs, current, selected, presets, isDirty,
    toggleRoute, addTab, selectTab, closeTab, saveCurrentAsPreset, openPreset, deletePreset, renameTab, renamePreset,
  };
}
