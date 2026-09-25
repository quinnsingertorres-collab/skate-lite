import { COOKIE, cookieOptions } from "@/lib/session";
import { json } from "@/lib/authServer";

export async function POST() {
  return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; ${cookieOptions(0)}` });
}
