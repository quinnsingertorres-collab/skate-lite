import { ADMIN_COOKIE, cookieOptions } from "@/lib/session";
import { json } from "@/lib/authServer";

export async function POST() {
  return json({ ok: true }, 200, { "Set-Cookie": `${ADMIN_COOKIE}=; ${cookieOptions(0)}` });
}
