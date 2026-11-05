// Block schedule (Skate's "minischedule") + live upcoming-stop predictions for one bus's trip.
import { blockSchedule, stopName, tripPredictions } from "@/lib/blocks";
import { serviceBase, serviceDateForTrip } from "@/lib/adherence";
import { runDefs, runFor } from "@/lib/runs";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const trip = (searchParams.get("trip") || "").slice(0, 64);
  if (!trip) return Response.json({ error: "trip required" }, { status: 400 });
  const date = serviceDateForTrip(trip, Math.floor(Date.now() / 1000));

  const sched = blockSchedule(trip, date);
  const current = sched?.trips.find((t) => t.trip === trip) || null;
  const schedBySeq = new Map((current?.timepoints || []).map((tp) => [tp.seq, tp]));
  const predictions = (await tripPredictions(trip)).map((p) => {
    const tp = schedBySeq.get(p.seq);
    return {
      ...p,
      name: stopName(p.stop) || p.stop,
      ...(tp ? { timepoint: tp.cp, scheduled: tp.time } : {}),
    };
  });

  // Runs defined on this block (from the public schedule)
  const base = serviceBase(date);
  const defs = sched?.block ? (await runDefs().catch(() => [])).filter((d) => d.block === sched.block) : [];
  const trips = (sched?.trips || []).map((t) => {
    const d = runFor(defs, sched.block, t.start - base);
    return { ...t, startSecs: t.start - base, ...(d ? { run: d.run, runStart: d.startSecs } : {}) };
  });

  return Response.json(
    { trip, date, block: sched?.block || null, trips, predictions, runs: defs.map(({ run, startSecs, endSecs, byName, at }) => ({ run, startSecs, endSecs, byName, at })) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
