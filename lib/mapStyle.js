// Shared map look, modelled on Skate's vehicle map (original code).
// Skate's own basemap is private. We use standard OpenStreetMap tiles and mute them with a CSS
// filter (see .skate-tiles in globals.css) to get Skate's quiet, light-gray look.
import { onTime } from "@/lib/ladder";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_OPTS = {
  maxZoom: 19,
  className: "skate-tiles",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const SHAPE_STYLE = { color: "#269c95", opacity: 0.5, weight: 5, lineCap: "round", lineJoin: "round" };
export const SHAPE_STYLE_SELECTED = { ...SHAPE_STYLE, weight: 7 };

const FILL = { early: "#e45d32", ontime: "#8bcf00", late: "#46a5e7", nonrevenue: "#8f7ed6", "": "#586f7c" };

function status(v) {
  if (v.revenue === false) return "nonrevenue";
  return onTime(v.adherence) || "";
}

const esc = (x) => String(x ?? "").replace(/[<>&"]/g, "");

// Arrow pointing along the bus's heading, with its number in a pill underneath.
export function vehicleMarkerHtml(v, { selected = false, primary = false } = {}) {
  const fill = FILL[status(v)] ?? FILL[""];
  const scale = primary ? 1 : 0.8;
  const rot = v.bearing ?? 0;
  const label = esc(v.label);
  return `<div class="mv${selected ? " is-selected" : ""}${primary ? " is-primary" : ""}">
    <svg class="mv-arrow" width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
      <path d="M0,-10.5 L7.5,8.5 Q7.8,9.6 6.7,9.2 L0,5.6 L-6.7,9.2 Q-7.8,9.6 -7.5,8.5 Z" fill="${fill}"
        transform="scale(${scale}) rotate(${rot})" />
    </svg>
    <span class="mv-label">${label}</span>
  </div>`;
}

export function stopMarkerOpts() {
  return { radius: 5, color: "#3c3f4c", weight: 1, fillColor: "#fff", fillOpacity: 1 };
}
