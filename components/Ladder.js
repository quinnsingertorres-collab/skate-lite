"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ladderPosition } from "@/lib/ladder";
import { VehicleGlyph, statusClass } from "@/components/VehicleGlyph";
import { CloseIcon, ReverseIcon } from "@/components/Icons";

// Geometry (px), modelled on Skate's ladder: rails either side of the centre,
// buses just outside the rails, extra buses stacked outward in lanes.
const LINE = 40; // centre → rail
const BASE = 63; // centre → first bus lane
const GROUP_H = 34; // buses closer than this vertically share lanes
const LANE_W = 32;
const EDGE = 26; // room past the outermost lane
const MARGIN_Y = 44;
const MIN_GAP = 34;

function assignLanes(list) {
  // list: same-direction vehicles, sorted in travel order
  const placed = [];
  for (const v of list) {
    const taken = placed.filter((p) => Math.abs(p.y - v.y) < GROUP_H).map((p) => p.lane).sort((a, b) => a - b);
    let lane = 0;
    while (taken.includes(lane)) lane++;
    placed.push({ ...v, lane });
  }
  return placed;
}

export default function Ladder({ route, vehicles, selectedId, onSelect, onRemove }) {
  const [reversed, setReversed] = useState(false);
  const n = route.timepoints.length;

  const body = useRef(null);
  const [avail, setAvail] = useState(0);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => setAvail(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const gap = Math.max(MIN_GAP, (avail - MARGIN_Y * 2) / Math.max(1, n - 1));
  const H = MARGIN_Y * 2 + Math.max(1, n - 1) * gap;
  const yFor = (pos) => MARGIN_Y + (reversed ? pos : n - 1 - pos) * gap;

  const ups = [], downs = [], unplaced = [];
  for (const v of vehicles) {
    const pos = v.dir == null ? null : ladderPosition(route, v);
    if (pos == null) { unplaced.push(v); continue; }
    const up = (v.dir === 0) !== reversed;
    (up ? ups : downs).push({ v, y: yFor(pos), up });
  }
  ups.sort((a, b) => b.y - a.y); // travelling up: lead bus has the smallest y, place followers after
  downs.sort((a, b) => a.y - b.y);
  const upL = assignLanes(ups), downL = assignLanes(downs);
  const lanesUsed = Math.max(1, ...upL.map((p) => p.lane + 1), ...downL.map((p) => p.lane + 1));
  const laneStep = lanesUsed <= 4 ? LANE_W - 2 : 24; // wide enough that number pills don't overlap
  const half = BASE + (lanesUsed - 1) * laneStep + EDGE;
  const W = Math.max(200, half * 2);
  const cx = W / 2;
  const placed = [
    ...upL.map((p) => ({ ...p, x: cx + BASE + p.lane * laneStep })),
    ...downL.map((p) => ({ ...p, x: cx - BASE - p.lane * laneStep })),
  ];
  const y0 = yFor(reversed ? 0 : n - 1), y1 = yFor(reversed ? n - 1 : 0);

  return (
    <section className="rl" aria-label={`Route ${route.name} ladder`}>
      <div className="rl-header">
        <span />
        <span className="route-pill route-pill--large">{route.name}</span>
        <button className="rl-close" onClick={onRemove} aria-label={`Close route ${route.name}`}>
          <CloseIcon size={12} />
        </button>
      </div>
      <div className="rl-controls">
        <button className="rl-reverse" onClick={() => setReversed((r) => !r)}>
          <ReverseIcon size={12} /> Reverse
        </button>
      </div>
      <div className="rl-body" ref={body}>
        <svg className="rl-svg" width={W} height={H} role="img" aria-label={`${placed.length} buses on route ${route.name}`}>
          <line className="rl-line" x1={cx - LINE} x2={cx - LINE} y1={y0} y2={y1} />
          <line className="rl-line" x1={cx + LINE} x2={cx + LINE} y1={y0} y2={y1} />
          {route.timepoints.map((t, i) => (
            <g key={t.id}>
              <circle className="rl-stop" cx={cx - LINE} cy={yFor(i)} r="3" />
              <circle className="rl-stop" cx={cx + LINE} cy={yFor(i)} r="3" />
              <text className="rl-tp" x={cx} y={yFor(i)} textAnchor="middle" dominantBaseline="central">
                <title>{t.name}</title>
                {t.id.toUpperCase()}
              </text>
            </g>
          ))}
          {placed.map(({ v, x, y, up }) => (
            <g
              key={v.id}
              className={`rl-vehicle${v.id === selectedId ? " rl-vehicle--selected" : ""}`}
              transform={`translate(${x},${y})`}
              onClick={() => onSelect(v)}
              role="button"
              aria-label={`Bus ${v.label}`}
            >
              <rect className="hit" x={-18} y={up ? -16 : -30} width={36} height={46} />
              <VehicleGlyph up={up} label={v.label} className={statusClass(v)} />
            </g>
          ))}
        </svg>
      </div>
      {unplaced.length > 0 && (
        <div className="rl-incoming">
          <div className="rl-incoming-label">Off main route</div>
          <div className="rl-incoming-list">
            {unplaced.map((v) => (
              <button key={v.id} className={statusClass(v)} onClick={() => onSelect(v)}>{v.label}</button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
