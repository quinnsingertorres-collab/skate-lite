import { getSession, json, requireAdmin } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { listUsers } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  const out = { signedIn: true, id: s.id, role: s.role };
  // If this browser is also signed in to the admin panel, show the Admin link with a waiting count
  if (await requireAdmin(req)) {
    out.admin = true;
    if (dbConfigured()) out.pending = (await listUsers().catch(() => [])).filter((u) => u.status === "pending").length;
  }
  return json(out);
}
