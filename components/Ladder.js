"use client";
import { useState } from "react";
import { ladderPosition } from "@/lib/ladder";

const GAP = 42, TOP = 26, W = 240, L = 80, R = 160;

function tri(x, y, up) {
  return up ? `M${x - 8},${y + 6} L${x},${y - 8} L${x + 8},${y + 6} Z` : `M${x - 8},${y - 6} L${x},${y + 8} L${x + 8},${y - 6} Z`;
}

export default function Ladder({ route, vehicles, selectedId, onSelect, onRemove }) {
  const [reversed, setReversed] = useState(false);
  const n = route.timepoints.length;
  const H = TOP * 2 + Math.max(1, n - 1) * GAP;
  // Default: last timepoint on top, like Skate. Direction 0 rides the right rail upward.
  const yFor = (pos) => TOP + (reversed ? pos : n - 1 - pos) * GAP;

  const placed = [], unplaced = [];
  for (const v of vehicles) {
    const pos = v.dir == null ? null : ladderPosition(route, v);
    if (pos == null) unplaced.push(v);
    else placed.push({ v, y: yFor(pos), right: (v.dir === 0) !== reversed });
  }
  // Nudge overlapping buses outward so labels stay readable
  for (const side of [true, false]) {
    const list = placed.filter((p) => p.right === side).sort((a, b) => a.y - b.y);
    let lastY = -99, stack = 0, prev = null;
    for (const p of list) {
      stack = p.y - lastY < 16 ? stack + 1 : 0;
      if (stack > 0) { p.below = true; if (prev) prev.below = true; }
      prev = p;
      const out = side ? 1 : -1;
      p.x = (side ? R : L) + out * Math.min(stack, 2) * 36;
      p.labelDx = out * 12;
      lastY = p.y;
    }
  }
  const d0 = route.dirs?.["0"], d1 = route.dirs?.["1"];
  const rightDir = reversed ? d1 : d0, leftDir = reversed ? d0 : d1;

  return (
    <section className="ladder" aria-label={`Route ${route.name} ladder`}>
      <div className="ladder-head">
        <span className="pill">{route.name}</span>
        <button onClick={() => setReversed((r) => !r)} title="Reverse ladder">⇅ Reverse</button>
        <button onClick={onRemove} title="Remove route" aria-label="Remove route">✕</button>
      </div>
      <div className="sub">
        <span>↓ {leftDir?.dest || ""}</span>
        <span>{rightDir?.dest || ""} ↑</span>
      </div>
      <svg width={W} height={H} role="img" aria-label={`${placed.length} buses on route ${route.name}`}>
        <line className="rail" x1={L} x2={L} y1={TOP - 8} y2={H - TOP + 8} />
        <line className="rail" x1={R} x2={R} y1={TOP - 8} y2={H - TOP + 8} />
        {route.timepoints.map((t, i) => (
          <g key={t.id}>
            <title>{t.name}</title>
            <text className="tp" x={(L + R) / 2} y={yFor(i) + 3} textAnchor="middle">{t.id.toUpperCase()}</text>
          </g>
        ))}
        {placed.map(({ v, x, y, right, labelDx, below }) => {
          const up = right;
          return (
            <g key={v.id} className={`veh${v.id === selectedId ? " sel" : ""}`} onClick={() => onSelect(v)} role="button" aria-label={`Bus ${v.label}`}>
              <path d={tri(x, y, up)} />
              {below ? (
                <text x={x} y={y + 20} textAnchor="middle">{v.label}</text>
              ) : (
                <text x={x + labelDx} y={y + 4} textAnchor={right ? "start" : "end"}>{v.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {unplaced.length > 0 && (
        <div className="unplaced">
          Off main pattern:{" "}
          {unplaced.map((v) => (
            <button key={v.id} onClick={() => onSelect(v)}>{v.label}</button>
          ))}
        </div>
      )}
    </section>
  );
}
