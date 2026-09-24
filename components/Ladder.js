"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ladderPosition } from "@/lib/ladder";
import { VehicleGlyph, statusClass } from "@/components/VehicleGlyph";
import { CloseIcon, KebabIcon, ReverseIcon, RidersIcon } from "@/components/Icons";

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
  const placed = [];
  for (const v of list) {
    const taken = placed.filter((p) => Math.abs(p.y - v.y) < GROUP_H).map((p) => p.lane);
    let lane = 0;
    while (taken.includes(lane)) lane++;
    placed.push({ ...v, lane });
  }
  return placed;
}

function riderLabel(v) {
  if (v.occupancyPct != null) return `${v.occupancyPct}%`;
  return "—";
}

function Menu({ reversed, showRiders, onReverse, onRiders, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const pick = (fn) => () => { fn(); setOpen(false); };
  return (
    <div className="rl-menu" ref={ref}>
      <button className="rl-menu-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Route options">
        <KebabIcon size={16} />
      </button>
      {open && (
        <div className="rl-menu-list" role="menu">
          <div className="rl-menu-head">Route options</div>
          <button role="menuitem" onClick={pick(onReverse)}>{reversed ? "Show normal direction" : "Reverse ladder"}</button>
          <button role="menuitem" onClick={pick(onRiders)}>{showRiders ? "Hide riders" : "Show riders"}</button>
          <hr />
          <button role="menuitem" onClick={pick(onRemove)}>Close route</button>
        </div>
      )}
    </div>
  );
}

export default function Ladder({ route, vehicles, selectedId, onSelect, onRemove }) {
  const [reversed, setReversed] = useState(false);
  const [showRiders, setShowRiders] = useState(false);
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
  const order = new Map(route.timepoints.map((t, i) => [t.id, i]));
  const schedPos = (s) => {
    if (!s) return null;
    const a = order.get(s.a), b = order.get(s.b);
    if (a != null && b != null) return a + s.f * (b - a);
    return a ?? b ?? null;
  };

  const ups = [], downs = [], incoming = [];
  for (const v of vehicles) {
    const pos = v.dir == null ? null : ladderPosition(route, v);
    if (pos == null) { incoming.push(v); continue; }
    const up = (v.dir === 0) !== reversed;
    const sp = schedPos(v.sched);
    (up ? ups : downs).push({ v, y: yFor(pos), up, schedY: sp == null ? null : yFor(sp) });
  }
  ups.sort((a, b) => b.y - a.y);
  downs.sort((a, b) => a.y - b.y);
  const upL = assignLanes(ups), downL = assignLanes(downs);
  const lanesUsed = Math.max(1, ...upL.map((p) => p.lane + 1), ...downL.map((p) => p.lane + 1));
  const laneStep = lanesUsed <= 4 ? LANE_W - 2 : 24;
  const half = BASE + (lanesUsed - 1) * laneStep + EDGE;
  const W = Math.max(200, half * 2);
  const cx = W / 2;
  const placed = [
    ...upL.map((p) => ({ ...p, x: cx + BASE + p.lane * laneStep, railX: cx + LINE })),
    ...downL.map((p) => ({ ...p, x: cx - BASE - p.lane * laneStep, railX: cx - LINE })),
  ];
  const y0 = yFor(reversed ? 0 : n - 1), y1 = yFor(reversed ? n - 1 : 0);

  return (
    <section className="rl" aria-label={`Route ${route.name} ladder`}>
      <div className="rl-header">
        <Menu
          reversed={reversed}
          showRiders={showRiders}
          onReverse={() => setReversed((r) => !r)}
          onRiders={() => setShowRiders((s) => !s)}
          onRemove={onRemove}
        />
        <span className="route-pill route-pill--large">{route.name}</span>
        <button className="rl-close" onClick={onRemove} aria-label={`Close route ${route.name}`}>
          <CloseIcon size={16} />
        </button>
      </div>
      <div className="rl-controls">
        <button className="rl-control" onClick={() => setReversed((r) => !r)}>
          <ReverseIcon size={12} /> Reverse
        </button>
        <button className={`rl-control${showRiders ? " is-on" : ""}`} onClick={() => setShowRiders((s) => !s)} aria-pressed={showRiders}>
          <RidersIcon size={12} /> {showRiders ? "Hide riders" : "Show riders"}
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
          {/* Schedule lines: from each bus to where it is scheduled to be */}
          {placed.map(({ v, x, y, railX, schedY }) =>
            schedY != null && Math.abs(schedY - y) > 3 ? (
              <line key={`s-${v.id}`} className={`rl-sched ${statusClass(v)}`} x1={x} y1={y} x2={railX} y2={schedY} />
            ) : null
          )}
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
              <VehicleGlyph up={up} label={showRiders ? riderLabel(v) : v.label} className={statusClass(v)} />
            </g>
          ))}
        </svg>
      </div>
      <div className="rl-incoming" aria-label="Buses not on the main route">
        {incoming.map((v) => (
          <button key={v.id} className="rl-incoming-veh" onClick={() => onSelect(v)} title="Not on the main route pattern">
            <svg width="14" height="12" viewBox="-7 -6 14 12" aria-hidden="true">
              <g className={`vg ${statusClass(v)}`}><polygon className="vg-tri" points="0,-4.5 5,4 -5,4" /></g>
            </svg>
            {showRiders ? riderLabel(v) : v.label}
          </button>
        ))}
      </div>
    </section>
  );
}
