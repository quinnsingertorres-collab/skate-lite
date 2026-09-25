// Block schedule (Skate's "minischedule") + live upcoming-stop predictions for one bus's trip.
import { blockSchedule, stopName, tripPredictions } from "@/lib/blocks";
import { todayServiceDate } from "@/lib/adherence";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const trip = (searchParams.get("trip") || "").slice(0, 64);
  const dateParam = searchParams.get("date") || "";
  if (!trip) return Response.json({ error: "trip required" }, { status: 400 });
  const date = /^\d{8}$/.test(dateParam) ? dateParam : todayServiceDate(Math.floor(Date.now() / 1000));

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

  return Response.json(
    { trip, date, block: sched?.block || null, trips: sched?.trips || [], predictions },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
  );
}
