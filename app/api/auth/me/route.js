import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { getUser } from "@/lib/users";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  let name = "";
  if (dbConfigured()) name = (await getUser(s.id).catch(() => null))?.name || "";
  return json({ signedIn: true, id: s.id, role: s.role, name });
}
