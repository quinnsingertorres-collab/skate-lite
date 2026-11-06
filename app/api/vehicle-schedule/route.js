// Block schedule (Skate's "minischedule") + live upcoming-stop predictions for one bus's trip.
import { blockSchedule, stopName, tripPredictions } from "@/lib/blocks";
import { serviceBase, serviceDateForTrip } from "@/lib/adherence";
import { expandRun, pieces, runDefs, runFor } from "@/lib/runs";

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

  // Runs: which trips of this block belong to which run, and this bus's own run laid out in full
  const base = serviceBase(date);
  const defs = await runDefs().catch(() => []);
  const trips = (sched?.trips || []).map((t) => {
    const d = sched.block ? runFor(defs, sched.block, t.start - base) : null;
    return { ...t, startSecs: t.start - base, ...(d ? { run: d.run, runId: d.id } : {}) };
  });
  const mine = current && sched?.block ? runFor(defs, sched.block, current.start - base) : null;
  const blockRuns = defs.filter((d) => pieces(d).some((p) => p.block === sched?.block)).map((d) => {
    const ps = pieces(d).filter((p) => p.block === sched.block);
    return { id: d.id, run: d.run, startSecs: Math.min(...ps.map((p) => p.startSecs)), endSecs: Math.max(...ps.map((p) => p.endSecs)) };
  });

  return Response.json(
    { trip, date, base, block: sched?.block || null, trips, predictions, blockRuns, run: mine ? expandRun(mine, date) : null, runDef: mine || null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
