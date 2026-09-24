"use client";
import { useCallback, useEffect, useState } from "react";

// Route-ladder tabs and saved presets, like Skate's tab bar. Stored per browser.
const TABS_KEY = "skate-lite:tabs";
const PRESETS_KEY = "skate-lite:presets";
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

  const saveCurrentAsPreset = useCallback(() => {
    if (!current || !current.routes.length) return;
    const name = current.presetId ? current.title : current.routes.join(", ");
    const presetId = current.presetId || uid();
    setPresets((ps) => {
      const rest = ps.filter((p) => p.id !== presetId);
      return [...rest, { id: presetId, name, routes: current.routes }];
    });
    updateCurrent((t) => ({ ...t, presetId, title: name }));
  }, [current, updateCurrent]);

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
    toggleRoute, addTab, selectTab, closeTab, saveCurrentAsPreset, openPreset, deletePreset,
  };
}
