// Live bus positions from MBTA's public enhanced GTFS-realtime feed, trimmed and cached for 10s at the edge.
const FEED = process.env.VEHICLES_URL || "https://cdn.mbta.com/realtime/VehiclePositions_enhanced.json";

export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch(FEED, { next: { revalidate: 10 } });
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const feed = await res.json();
    const vehicles = [];
    for (const e of feed.entity || []) {
      const v = e.vehicle;
      if (!v?.position) continue;
      const trip = v.trip || {};
      const route = trip.route_id || null;
      // Skip rail (letters-only route IDs like "Red", "Green-B") but keep bus + SL routes (numeric IDs)
      if (route && !/^\d/.test(route)) continue;
      vehicles.push({
        id: v.vehicle?.id || e.id,
        label: v.vehicle?.label || e.id,
        route,
        dir: trip.direction_id ?? null,
        trip: trip.trip_id || null,
        revenue: trip.revenue !== false,
        stop: v.stop_id || null,
        seq: v.current_stop_sequence ?? null,
        status: v.current_status || null,
        lat: v.position.latitude,
        lon: v.position.longitude,
        bearing: v.position.bearing ?? null,
        occupancy: v.occupancy_status || null,
        ts: v.timestamp || null,
      });
    }
    return Response.json(
      { fetched: Math.floor(Date.now() / 1000), vehicles },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } }
    );
  } catch (err) {
    return Response.json({ error: String(err), vehicles: [] }, { status: 502 });
  }
}
