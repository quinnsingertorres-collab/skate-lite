// Fetch live JSON without Next's data cache. Next's time-based cache serves the *old* copy
// first and refreshes in the background, which after a quiet period can be hours or days
// old, so buses showed up where they used to be. Instead: always go to the source,
// share one request between callers for a few seconds per server instance.
const cache = new Map(); // url -> { at, promise }

export function liveJson(url, { ttlMs = 4000, headers, timeoutMs = 6000 } = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.promise;
  const promise = fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) }).then(async (res) => {
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  });
  cache.set(url, { at: Date.now(), promise });
  promise.catch(() => cache.delete(url));
  return promise;
}
