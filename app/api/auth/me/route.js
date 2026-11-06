import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { displayName } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  const name = dbConfigured() ? await displayName(s).catch(() => "") : "";
  return json({ signedIn: true, id: s.id, role: s.role, name });
}
