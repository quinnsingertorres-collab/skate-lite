// Diagnostic: tries several Swiftly endpoints with the server's key and reports only
// status codes and Swiftly's error messages (never the key). Cached for a minute.
import { AGENCY, SWIFTLY_KEY, swiftlyFetch, vehicleUrlCandidates } from "@/lib/swiftly";

export const revalidate = 0;

export async function GET() {
  if (!SWIFTLY_KEY) {
    return Response.json({ keySet: false, advice: "SWIFTLY_API_KEY is not set for this deployment. Add it in Vercel and redeploy." });
  }
  const base = (process.env.SWIFTLY_BASE_URL || "https://api.goswift.ly").replace(/\/$/, "");
  const tests = [
    ...vehicleUrlCandidates(),
    { name: "GTFS-rt vehicle positions (JSON)", url: `${base}/real-time/${encodeURIComponent(AGENCY)}/gtfs-rt-vehicle-positions?format=json` },
    { name: "GTFS-rt trip updates (JSON)", url: `${base}/real-time/${encodeURIComponent(AGENCY)}/gtfs-rt-trip-updates?format=json` },
    { name: "agency info", url: `${base}/info/${encodeURIComponent(AGENCY)}` },
  ];
  const results = [];
  for (const t of tests) {
    try {
      const r = await swiftlyFetch(t.url, 60);
      const vehicles = r.body?.data?.vehicles?.length ?? r.body?.entity?.length;
      results.push({ test: t.name, status: r.status, ok: r.ok, ...(r.message ? { message: r.message } : {}), ...(vehicles != null ? { items: vehicles } : {}) });
    } catch (e) {
      results.push({ test: t.name, status: 0, ok: false, message: String(e) });
    }
  }
  return Response.json(
    { keySet: true, keyLength: SWIFTLY_KEY.length, agency: AGENCY, customUrl: !!process.env.SWIFTLY_VEHICLES_URL, results },
    { headers: { "Cache-Control": "public, s-maxage=60" } }
  );
}
