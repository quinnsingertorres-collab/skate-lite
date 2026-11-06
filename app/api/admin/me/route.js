// The admin login's own name (shown in the app and the admin panel).
import { json, requireAdmin } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { setAdminName } from "@/lib/users";

export const runtime = "nodejs";

export async function PATCH(req) {
  if (!(await requireAdmin(req))) return json({ error: "Admins only" }, 403);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  return json({ name: await setAdminName(body.name) });
}
