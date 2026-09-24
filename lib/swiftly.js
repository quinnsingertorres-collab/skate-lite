// Swiftly real-time vehicles, server-side only. The key never leaves the server.
// Skate calls /vehicles with unassigned=true&verbose=true, but those options can need extra
// permissions: on a 403 we fall back to simpler requests and remember whichever one works.

// Tolerate common paste mistakes: surrounding quotes/whitespace/newlines, or a copied "Authorization:"/"Bearer" prefix
export const SWIFTLY_KEY = (process.env.SWIFTLY_API_KEY || "")
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/^authorization:\s*/i, "")
  .replace(/^bearer\s+/i, "")
  .trim();

export const AGENCY = (process.env.SWIFTLY_AGENCY || "mbta").trim();
const BASE = (process.env.SWIFTLY_BASE_URL || "https://api.goswift.ly").replace(/\/$/, "");

export function vehicleUrlCandidates() {
  const list = [];
  if (process.env.SWIFTLY_VEHICLES_URL) list.push({ name: "SWIFTLY_VEHICLES_URL", url: process.env.SWIFTLY_VEHICLES_URL.trim() });
  const v = `${BASE}/real-time/${encodeURIComponent(AGENCY)}/vehicles`;
  list.push({ name: "vehicles (unassigned + verbose)", url: `${v}?unassigned=true&verbose=true` });
  list.push({ name: "vehicles (verbose)", url: `${v}?verbose=true` });
  list.push({ name: "vehicles (plain)", url: v });
  return list;
}

export async function swiftlyFetch(url, revalidate = 10) {
  const res = await fetch(url, {
    headers: { Authorization: SWIFTLY_KEY, Accept: "application/json" },
    next: { revalidate },
    signal: AbortSignal.timeout(6000),
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, ok: res.ok, body, message: body?.errorMessage || body?.message || "" };
}

let working = null; // URL that last succeeded

function hintFor(status) {
  return status === 401 ? "key not accepted; check SWIFTLY_API_KEY"
    : status === 403 ? `key accepted but not allowed to read vehicles for agency "${AGENCY}"; open /api/swiftly-check`
    : status === 404 ? "agency not found; check SWIFTLY_AGENCY"
    : status === 429 ? "rate limited by Swiftly" : "";
}

export async function swiftlyVehicles() {
  if (!SWIFTLY_KEY) return { status: "off", vehicles: [] };
  const candidates = working ? [{ url: working }, ...vehicleUrlCandidates().filter((c) => c.url !== working)] : vehicleUrlCandidates();
  let last = null;
  for (const c of candidates) {
    try {
      last = await swiftlyFetch(c.url);
    } catch (e) {
      last = { status: 0, ok: false, message: String(e) };
    }
    if (last.ok) {
      working = c.url;
      return { status: "ok", vehicles: last.body?.data?.vehicles || [] };
    }
    // Only a permissions problem is worth retrying with simpler options
    if (last.status !== 403) break;
  }
  return {
    status: `error ${last?.status ?? "?"}`,
    detail: [last?.message, hintFor(last?.status)].filter(Boolean).join(" – "),
    vehicles: [],
  };
}
