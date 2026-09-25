// Saved route-ladder presets, stored per account so they open on any device.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured, k, redis } from "@/lib/db";

export const runtime = "nodejs";
const key = (id) => k(`presets:${id}`);
const MAX_PRESETS = 100, MAX_ROUTES = 60;

function clean(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, MAX_PRESETS).map((p) => ({
    id: String(p?.id || "").slice(0, 20),
    name: String(p?.name || "").trim().slice(0, 60) || "Preset",
    routes: (Array.isArray(p?.routes) ? p.routes : []).slice(0, MAX_ROUTES).map((r) => String(r).slice(0, 20)),
  })).filter((p) => p.id && p.routes.length);
}

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ presets: null, synced: false });
  const raw = await redis("GET", key(s.id));
  let presets = null;
  try { presets = raw ? clean(JSON.parse(raw)) : null; } catch {}
  return json({ presets, synced: true });
}

export async function PUT(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = await req.json().catch(() => ({}));
  const presets = clean(body.presets);
  if (!presets) return json({ error: "Bad presets" }, 400);
  await redis("SET", key(s.id), JSON.stringify(presets));
  return json({ ok: true, presets });
}
