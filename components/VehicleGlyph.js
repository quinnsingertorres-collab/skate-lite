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

export function VehicleGlyph({ up = true, side = null, label, variant = "", size = "medium", className = "", withLabel = true }) {
  const { s, pillH, font } = SIZES[size];
  const text = String(label ?? "");
  // Sideways (laying over at a terminal, beyond the end of the ladder)
  if (side) {
    const h = 15 * s, w = 16 * s;
    const pts = side === "right" ? `${h},0 ${-h},${-w} ${-h},${w}` : `${-h},0 ${h},${-w} ${h},${w}`;
    const pillW = text.length <= 4 ? 26 : 38;
    return (
      <g className={`vg ${className}`}>
        <polygon className="vg-halo" points={pts} />
        <polygon className="vg-tri" points={pts} />
        {variant && (
          <text className="vg-variant" x={side === "right" ? -h * 0.3 : h * 0.3} y="0" textAnchor="middle" dominantBaseline="central" fontSize={8}>{variant}</text>
        )}
        {withLabel && text && (
          <>
            <rect className="vg-pill" x={-pillW / 2} y={w + 1} width={pillW} height={pillH} rx={pillH / 2} />
            <text className="vg-label" x="0" y={w + 1 + pillH / 2} textAnchor="middle" dominantBaseline="central" fontSize={font}>{text}</text>
          </>
        )}
      </g>
    );
  }
  const h = 20 * s; // centre → point / base
  const w = 21 * s;
  const pts = up ? `0,${-h} ${w},${h} ${-w},${h}` : `0,${h} ${w},${-h} ${-w},${-h}`;
  const pillW = size === "large" ? (text.length <= 4 ? 64 : 76) : text.length <= 4 ? 26 : 38;
  const pillY = up ? h + 1 : -h - pillH - 1;
  return (
    <g className={`vg ${className}`}>
      <polygon className="vg-halo" points={pts} />
      <polygon className="vg-tri" points={pts} />
      {variant && (
        <text className="vg-variant" x="0" y={(up ? 1 : -1) * h * 0.38} textAnchor="middle" dominantBaseline="central" fontSize={size === "large" ? 15 : size === "small" ? 6 : 8.5}>
          {variant}
        </text>
      )}
      {withLabel && text && size === "large" && (
        <text className="vg-big-label" x="0" y={h + 30} textAnchor="middle" fontSize="30">{text}</text>
      )}
      {withLabel && text && size !== "large" && (
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
  const box = size === "large" ? { w: 110, h: 82, cy: 24 } : { w: 40, h: 40, cy: 14 };
  return (
    <svg width={box.w} height={box.h} viewBox={`${-box.w / 2} ${-box.cy} ${box.w} ${box.h}`} aria-hidden="true">
      <VehicleGlyph up={up} label={vehicle.label} variant={vehicle.variant && vehicle.variant !== "_" ? vehicle.variant : ""} size={size} className={statusClass(vehicle)} />
    </svg>
  );
}
