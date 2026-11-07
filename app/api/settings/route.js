// Your settings: vehicle labels (run or vehicle number) and adherence colors (early red/blue).
import { getSession, json } from "@/lib/authServer";
import { dbConfigured } from "@/lib/db";
import { saveSettings } from "@/lib/users";

export const runtime = "nodejs";

export async function PUT(req) {
  const s = await getSession(req);
  if (!s) return json({ error: "Sign in required" }, 401);
  if (!dbConfigured()) return json({ error: "Database not connected" }, 503);
  const body = (await req.json().catch(() => null)) || {};
  return json({ settings: await saveSettings(s, body) });
}
