"use client";
import { useEffect, useState } from "react";

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
export const fmtTime = (t) => (t ? clock.format(new Date(t * 1000)) : "—");

/** Fetches the bus's block schedule + live predictions; refreshes every 20s. */
export function useVehicleSchedule(trip) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!trip) { setData(null); return; }
    let dead = false;
    const load = () =>
      fetch(`/api/vehicle-schedule?trip=${encodeURIComponent(trip)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!dead && d) setData(d); })
        .catch(() => {});
    setData(null);
    load();
    const t = setInterval(load, 20000);
    return () => { dead = true; clearInterval(t); };
  }, [trip]);
  return data;
}

function Tri({ up, className = "" }) {
  return (
    <svg width="12" height="11" viewBox="-6 -5.5 12 11" aria-hidden="true" className={`ms-tri ${className}`}>
      <polygon points={up ? "0,-4.5 5,4 -5,4" : "0,4.5 5,-4 -5,-4"} />
    </svg>
  );
}

const minsFrom = (t, now) => Math.round((t - now) / 60);
function delta(pred, sched) {
  if (!pred || !sched) return null;
  const d = (pred - sched) / 60;
  const cls = d > 6 ? "late" : d < -1 ? "early" : "ontime";
  return { text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}`, cls };
}

/** Status tab: the rest of the current trip, with live predicted times. */
export function UpcomingStops({ data, now, nextSeq = null, limit = 8 }) {
  const [all, setAll] = useState(false);
  if (!data) return <p className="ms-empty">Loading upcoming stops…</p>;
  // Only stops still ahead of the bus (skipped stops behind it aren't "upcoming")
  const upcoming = data.predictions.filter(
    (p) => (nextSeq == null || p.seq >= nextSeq) && (p.skipped || p.time >= now - 30)
  );
  if (!upcoming.length) return <p className="ms-empty">No live predictions for this trip right now.</p>;
  const shown = all ? upcoming : upcoming.slice(0, limit);
  return (
    <div className="ms-upcoming">
      <ol>
        {shown.map((p, i) => {
          const d = delta(p.time, p.scheduled);
          const m = p.time ? minsFrom(p.time, now) : null;
          return (
            <li key={`${p.seq}-${p.stop}`} className={`${p.timepoint ? "is-tp" : ""}${i === 0 ? " is-next" : ""}${p.skipped ? " is-skipped" : ""}`}>
              <span className="ms-dot" aria-hidden="true" />
              <span className="ms-stop">
                <span className="ms-stop-name">{p.name}</span>
                {p.timepoint && <span className="ms-tp-id">{p.timepoint.toUpperCase()}</span>}
              </span>
              <span className="ms-times">
                {p.skipped ? (
                  <span className="ms-skipped">Skipped</span>
                ) : (
                  <>
                    <b>{fmtTime(p.time)}</b>
                    <span className="ms-in">{m <= 0 ? "now" : `${m} min`}</span>
                    {p.scheduled && (
                      <span className="ms-sched" title={`Scheduled ${fmtTime(p.scheduled)}`}>
                        sch {fmtTime(p.scheduled)}{d && <em className={d.cls}> {d.text}</em>}
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {upcoming.length > limit && (
        <button className="ms-more" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${upcoming.length} stops`}
        </button>
      )}
    </div>
  );
}

/** Block tab: every trip in the bus's block, like Skate's minischedule. */
export function BlockSchedule({ data, vehicle, now, upFor }) {
  const [showPast, setShowPast] = useState(false);
  if (!data) return <p className="ms-empty">Loading block…</p>;
  if (!data.trips.length) return <p className="ms-empty">No schedule found for this trip.</p>;
  const curIdx = data.trips.findIndex((t) => t.trip === data.trip);
  const nextSeq = vehicle.seq ?? null;
  const pastCount = data.trips.filter((t, i) => i < curIdx).length;

  return (
    <div className="ms-block">
      <div className="ms-block-head">
        <span className="ms-label">Block</span>
        <b>{data.block || "—"}</b>
        {pastCount > 0 && (
          <button className="ms-past-toggle" onClick={() => setShowPast((s) => !s)}>
            {showPast ? "Hide past trips" : `Show past trips (${pastCount})`}
          </button>
        )}
      </div>
      <ol className="ms-trips">
        {data.trips.map((t, i) => {
          if (i < curIdx && !showPast) return null;
          const state = i < curIdx ? "past" : i === curIdx ? "current" : "future";
          const name = `${t.route || ""}_${t.variant && t.variant !== "_" ? t.variant : ""} ${t.headsign || ""}`;
          return (
            <li key={t.trip} className={`ms-trip is-${state}`}>
              <div className="ms-row">
                <Tri up={upFor(t.dir)} className={state === "current" ? vehicleStatus(vehicle) : ""} />
                <span className="ms-row-text">{name}</span>
                <span className="ms-row-time">{fmtTime(t.start)}</span>
              </div>
              {state === "current" && (
                <ol className="ms-tps">
                  {t.timepoints.map((tp) => {
                    const passed = nextSeq != null && tp.seq < nextSeq;
                    return (
                      <li key={`${tp.seq}-${tp.cp}`} className={passed ? "is-past" : ""}>
                        <span className="ms-tp-name">{tp.name}</span>
                        <span className="ms-row-time">{fmtTime(tp.time)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
      <p className="ms-note">Scheduled times from the MBTA timetable.</p>
    </div>
  );
}

function vehicleStatus(v) {
  if (v.adherence == null) return "";
  return v.adherence < -60 ? "early" : v.adherence > 360 ? "late" : "ontime";
}
