// Shared map look, modelled on Skate's vehicle map (original code).
// Skate's own basemap is private. We use standard OpenStreetMap tiles and mute them with a CSS
// filter (see .skate-tiles in globals.css) to get Skate's quiet, light-gray look.
import { onTime } from "@/lib/ladder";
import { displayLabel } from "@/lib/labels";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_OPTS = {
  maxZoom: 19,
  className: "skate-tiles",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const SHAPE_STYLE = { color: "#5fb8b1", opacity: 0.75, weight: 6, lineCap: "round", lineJoin: "round" };
export const SHAPE_STYLE_SELECTED = { ...SHAPE_STYLE, weight: 7 };

// Colors come from CSS variables so the Settings choice (early bus red or blue) applies here too
const FILL = { early: "var(--early)", ontime: "var(--ontime)", late: "var(--late)", nonrevenue: "var(--nonrevenue)", ghost: "transparent", "": "#586f7c" };

function status(v) {
  if (v.revenue === false) return "nonrevenue";
  return onTime(v.adherence) || "";
}

const esc = (x) => String(x ?? "").replace(/[<>&"]/g, "");

// Arrow pointing along the bus's heading, with its number in a pill underneath.
export function vehicleMarkerHtml(v, { selected = false, primary = false } = {}) {
  const fill = FILL[status(v)] ?? FILL[""];
  const scale = primary ? 1 : 0.8;
  const rot = Number(v.bearing) || 0;
  const label = esc(displayLabel(v));
  return `<div class="mv${selected ? " is-selected" : ""}${primary ? " is-primary" : ""}">
    <svg class="mv-arrow" width="26" height="26" viewBox="-13 -13 26 26" aria-hidden="true">
      <path d="M0,-10.5 L7.5,8.5 Q7.8,9.6 6.7,9.2 L0,5.6 L-6.7,9.2 Q-7.8,9.6 -7.5,8.5 Z" style="fill:${fill}"
        transform="scale(${scale}) rotate(${rot})" />
    </svg>
    <span class="mv-label">${label}</span>
  </div>`;
}

export function stopMarkerOpts() {
  return { radius: 5, color: "#3c3f4c", weight: 1, fillColor: "#fff", fillOpacity: 1 };
}

// Bus-stop marker: a small white disc with a simple bus drawn in it.
const STOP_HTML = `<span class="map-stop"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
  <rect x="2.5" y="1.5" width="7" height="7.5" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.2"/>
  <path d="M2.8 5.3h6.4" stroke="currentColor" stroke-width="1.1"/>
  <path d="M4 9.2v1.3M8 9.2v1.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg></span>`;

export function stopMarker(L, st) {
  return L.marker([st.lat, st.lon], {
    icon: L.divIcon({ className: "", html: STOP_HTML, iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false,
  }).bindTooltip(esc(st.name), { direction: "top", offset: [0, -9], className: "map-tip" });
}
