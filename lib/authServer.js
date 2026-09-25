// Helpers for API routes (Node runtime).
import { COOKIE, verifySession } from "@/lib/session";
import { adminId, adminVersion } from "@/lib/users";

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export async function getSession(req) {
  return verifySession(readCookie(req));
}

export async function requireAdmin(req) {
  const s = await getSession(req);
  if (!s || s.role !== "admin" || s.id !== adminId() || s.ver !== adminVersion()) return null;
  return s;
}

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
