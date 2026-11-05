// Create / delete run definitions from the public schedule. Anyone signed in can edit.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { getUser } from "@/lib/users";
import { RUN_RE, deleteRunDef, runDefs, saveRunDef, tripInfo } from "@/lib/runs";

export const runtime = "nodejs";

export async function POST(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const run = String(body.run || "").trim().toUpperCase();
  if (!RUN_RE.test(run)) return json({ error: "Enter a run number (letters, numbers and dashes, up to 16)." }, 400);
  const a = tripInfo(String(body.fromTrip || "")), b = tripInfo(String(body.toTrip || ""));
  if (!a || !b || !a.block) return json({ error: "Pick the first and last trip of the run." }, 400);
  if (a.block !== b.block) return json({ error: "Both trips must be in the same block." }, 400);
  if (b.start < a.start) return json({ error: "The last trip has to come after the first one." }, 400);
  const block = a.block, startSecs = a.start, endSecs = b.start;
  const replace = body.replaceStart != null ? Number(body.replaceStart) : null;
  const clash = (await runDefs()).find((d) => d.block === block && d.startSecs !== replace && startSecs <= d.endSecs && endSecs >= d.startSecs);
  if (clash) return json({ error: `That overlaps run ${clash.run} on this block. Change or delete that one first.` }, 409);
  const u = await getUser(s.id);
  if (replace != null && replace !== startSecs) await deleteRunDef(block, replace);
  const def = { run, block, startSecs, endSecs, by: s.id, byName: u?.name || "", at: Math.floor(Date.now() / 1000) };
  await saveRunDef(def);
  return json({ ok: true, def });
}

export async function DELETE(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const q = new URL(req.url).searchParams;
  const block = String(q.get("block") || "").slice(0, 40), start = Number(q.get("start"));
  if (!block || !Number.isFinite(start)) return json({ error: "Missing block or start" }, 400);
  await deleteRunDef(block, start);
  return json({ ok: true });
}
