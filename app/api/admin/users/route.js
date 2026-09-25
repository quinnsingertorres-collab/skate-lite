import { json, requireAdmin } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { createId, listUsers } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req) {
  if (!(await requireAdmin(req))) return json({ error: "Admins only" }, 403);
  if (!dbConfigured()) return json({ error: "Accounts database isn't connected yet.", users: [] }, 503);
  return json({ users: await listUsers() });
}

export async function POST(req) {
  if (!(await requireAdmin(req))) return json({ error: "Admins only" }, 403);
  const { id, name } = await req.json().catch(() => ({}));
  try {
    return json({ user: await createId({ id, name }) });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
