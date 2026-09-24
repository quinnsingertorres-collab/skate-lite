// Fallback trip details (block, headsign, route pattern) from the MBTA V3 API, for trips
// that aren't in the build-time schedule index (e.g. added service). One batched request,
// cached per server instance so each trip is looked up at most once an hour.
const API = (process.env.API_URL || "https://api-v3.mbta.com/").replace(/\/?$/, "/");
const KEY = (process.env.API_KEY || process.env.MBTA_API_KEY || "").trim();
const TTL = 3600e3;
const cache = new Map(); // trip_id -> { at, data }

export async function lookupTrips(tripIds) {
  const now = Date.now();
  const out = new Map();
  const missing = [];
  for (const id of tripIds) {
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL) out.set(id, hit.data);
    else missing.push(id);
  }
  if (!missing.length) return out;

  try {
    for (let i = 0; i < missing.length; i += 80) {
      const batch = missing.slice(i, i + 80);
      const url = `${API}trips?filter[id]=${encodeURIComponent(batch.join(","))}&fields[trip]=block_id,headsign&include=route_pattern&fields[route_pattern]=`;
      const res = await fetch(url, {
        headers: { Accept: "application/vnd.api+json", ...(KEY ? { "x-api-key": KEY } : {}) },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) break; // rate-limited or down: just go without
      const body = await res.json();
      for (const t of body.data || []) {
        const data = {
          block: t.attributes?.block_id || null,
          headsign: t.attributes?.headsign || null,
          pattern: t.relationships?.route_pattern?.data?.id || null,
        };
        cache.set(t.id, { at: now, data });
        out.set(t.id, data);
      }
      // Remember trips the API doesn't know either, so we don't keep asking
      for (const id of batch) if (!out.has(id)) cache.set(id, { at: now, data: null });
    }
  } catch {
    // network error / timeout: block stays unavailable for these trips this time
  }
  return out;
}
