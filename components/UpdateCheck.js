"use client";
import { useEffect } from "react";

// A home-screen app keeps running the code it first loaded. When a newer version has been
// deployed, reload (when the app is opened again, or every 10 minutes while open).
const MINE = process.env.NEXT_PUBLIC_BUILD || "";

export default function UpdateCheck() {
  useEffect(() => {
    if (!MINE) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        if (d?.build && d.build !== MINE) {
          // Only try once per new version, so a stale cache can't cause a reload loop
          let tried = null;
          try { tried = sessionStorage.getItem("skate-lite:reloaded-for"); } catch {}
          if (tried === d.build) return;
          try { sessionStorage.setItem("skate-lite:reloaded-for", d.build); } catch {}
          window.location.reload();
        }
      } catch {} finally { busy = false; }
    };
    check();
    const t = setInterval(check, 10 * 60 * 1000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
