// Helpers for API routes (Node runtime).
import { ADMIN_COOKIE, COOKIE, verifySession } from "@/lib/session";
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
  const s = await verifySession(readCookie(req));
  return s && s.role === "user" ? s : null;
}

export async function requireAdmin(req) {
  const s = await verifySession(readCookie(req, ADMIN_COOKIE));
  if (!s || s.role !== "admin" || s.id !== adminId() || s.ver !== adminVersion()) return null;
  return s;
}

export const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
