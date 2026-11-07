import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { DEFAULT_SETTINGS, displayName, getSettings } from "@/lib/users";
import { canUseRoster } from "@/lib/roster";

export const runtime = "nodejs";

export async function GET(req) {
  const s = await getSession(req);
  if (!s) return json({ signedIn: false }, 401);
  const name = dbConfigured() ? await displayName(s).catch(() => "") : "";
  const roster = dbConfigured() ? await canUseRoster(s).catch(() => false) : false;
  const settings = dbConfigured() ? await getSettings(s).catch(() => DEFAULT_SETTINGS) : DEFAULT_SETTINGS;
  return json({ signedIn: true, id: s.id, role: s.role, name, roster, settings });
}
