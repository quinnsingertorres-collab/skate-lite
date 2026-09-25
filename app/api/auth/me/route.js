import { getSession, json } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  return json({ signedIn: true, id: s.id, role: s.role });
}
