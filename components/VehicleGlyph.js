import { onTime } from "@/lib/ladder";

// Rounded triangle bus icon with a pill label, centred on (0,0).
// size: "medium" (ladders) | "large" (panel header)
const SIZES = {
  small: { s: 0.42, pillH: 11, font: 9 },
  medium: { s: 0.56, pillH: 11, font: 9 },
  large: { s: 1, pillH: 20, font: 14 },
};

export function statusClass(v) {
  if (!v) return "";
  if (v.revenue === false) return "nonrevenue";
  return onTime(v.adherence) || "";
}

export function VehicleGlyph({ up = true, label, size = "medium", className = "", withLabel = true }) {
  const { s, pillH, font } = SIZES[size];
  const h = 20 * s; // centre → point / base
  const w = 21 * s;
  const pts = up ? `0,${-h} ${w},${h} ${-w},${h}` : `0,${h} ${w},${-h} ${-w},${-h}`;
  const text = String(label ?? "");
  const pillW = size === "large" ? (text.length <= 4 ? 64 : 76) : text.length <= 4 ? 26 : 38;
  const pillY = up ? h + 1 : -h - pillH - 1;
  return (
    <g className={`vg ${className}`}>
      <polygon className="vg-halo" points={pts} />
      <polygon className="vg-tri" points={pts} />
      {withLabel && text && (
        <>
          <rect className="vg-pill" x={-pillW / 2} y={pillY} width={pillW} height={pillH} rx={pillH / 2} />
          <text className="vg-label" x="0" y={pillY + pillH / 2} textAnchor="middle" dominantBaseline="central" fontSize={font}>
            {text}
          </text>
        </>
      )}
    </g>
  );
}

// Standalone SVG wrapper (for lists and the panel header)
export function VehicleBadge({ vehicle, up = true, size = "small" }) {
  const box = size === "large" ? { w: 80, h: 70, cy: 26 } : { w: 40, h: 40, cy: 14 };
  return (
    <svg width={box.w} height={box.h} viewBox={`${-box.w / 2} ${-box.cy} ${box.w} ${box.h}`} aria-hidden="true">
      <VehicleGlyph up={up} label={vehicle.label} size={size} className={statusClass(vehicle)} />
    </svg>
  );
}
