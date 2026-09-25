"use client";
import { useEffect } from "react";
import { THEME_COLORS, isDarkInBoston } from "@/lib/sunTheme";

// Keeps the theme in step with Boston sunset/sunrise while the page is open.
export default function ThemeClock() {
  useEffect(() => {
    const apply = () => {
      const q = new URLSearchParams(window.location.search).get("theme");
      const dark = q ? q === "dark" : isDarkInBoston(new Date());
      const theme = dark ? "dark" : "light";
      if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
      meta.content = THEME_COLORS[theme];
    };
    apply();
    const t = setInterval(apply, 60000);
    document.addEventListener("visibilitychange", apply);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", apply); };
  }, []);
  return null;
}
