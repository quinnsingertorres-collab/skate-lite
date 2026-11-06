// Build, edit and delete runs (from the public schedule). Anyone signed in can edit.
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { displayName } from "@/lib/users";
import { deleteRunDef, runDefs, saveRunDef, suggestRunNumber, validateRun } from "@/lib/runs";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  const q = new URL(req.url).searchParams;
  if (q.get("suggest")) {
    const taken = new Set((await runDefs()).map((d) => d.run));
    return json({ run: suggestRunNumber(String(q.get("block") || ""), taken) });
  }
  const id = q.get("id");
  const def = (await runDefs()).find((d) => d.id === id);
  return def ? json({ def }) : json({ error: "No such run" }, 404);
}

export async function POST(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  const id = body.id ? String(body.id).slice(0, 40) : null;
  const others = (await runDefs()).filter((d) => d.id !== id);
  const { def, error } = validateRun(body, others);
  if (error) return json({ error }, 400);
  const saved = await saveRunDef({ ...def, id: id || undefined, by: s.id, byName: await displayName(s).catch(() => ""), at: Math.floor(Date.now() / 1000) });
  return json({ ok: true, def: saved });
}

export async function DELETE(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const id = String(new URL(req.url).searchParams.get("id") || "").slice(0, 40);
  if (!id) return json({ error: "Missing run" }, 400);
  await deleteRunDef(id);
  return json({ ok: true });
}
