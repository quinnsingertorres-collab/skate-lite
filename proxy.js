// Requires sign-in for every page and data request (Next.js 16 "proxy", formerly middleware).
// Two separate sign-ins:
//   - the app (route ladders etc.) uses the "sk8_session" cookie, from /signin
//   - the admin panel (/admin) uses the "sk8_admin" cookie, from /admin/signin
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, COOKIE, RECHECK_SECS, cookieOptions, signSession, verifySession } from "@/lib/session";
import { dbConfigured, k, redis } from "@/lib/db";

const PUBLIC_PATHS = [
  "/signin", "/api/auth/signin", "/api/auth/setup", "/api/auth/signout",
  "/admin/signin", "/api/admin/signin", "/api/admin/signout",
];

async function adminVersion() {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(process.env.ADMIN_PASSWORD || ""));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

// Is this app session still valid? (account still approved, not reset/disabled)
async function userStillValid(s) {
  if (!dbConfigured()) return false;
  const [status, ver] = (await redis("HMGET", k(`u:${s.id}`), "status", "ver")) || [];
  return status === "approved" && Number(ver) === Number(s.ver);
}

const isApi = (p) => p.startsWith("/api/") || p.startsWith("/data/");

function deny(req, { admin = false } = {}) {
  const { pathname, search } = req.nextUrl;
  const signin = admin ? "/admin/signin" : "/signin";
  const home = admin ? "/admin" : "/";
  const res = isApi(pathname)
    ? NextResponse.json({ error: admin ? "Admin sign-in required" : "Sign in required" }, { status: 401 })
    : NextResponse.redirect(new URL(`${signin}${pathname !== home ? `?next=${encodeURIComponent(pathname + search)}` : ""}`, req.url));
  res.headers.append("Set-Cookie", `${admin ? ADMIN_COOKIE : COOKIE}=; ${cookieOptions(0)}`);
  return res;
}

export async function proxy(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  // ---- Admin panel: admin cookie only
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/")) {
    const s = await verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
    const ok = s && s.role === "admin" && s.id === (process.env.ADMIN_ID || "").trim() && s.ver === (await adminVersion());
    return ok ? NextResponse.next() : deny(req, { admin: true });
  }

  // ---- The app: regular account cookie
  const session = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!session || session.role !== "user") return deny(req);

  // Every so often, re-confirm the account and roll the cookie forward
  const now = Math.floor(Date.now() / 1000);
  if (now - (session.chk || 0) > RECHECK_SECS) {
    let ok = false;
    try { ok = await userStillValid(session); } catch { ok = true; /* database hiccup: don't lock people out */ }
    if (!ok) return deny(req);
    const res = NextResponse.next();
    const token = await signSession({ id: session.id, role: session.role, ver: session.ver });
    res.headers.append("Set-Cookie", `${COOKIE}=${token}; ${cookieOptions()}`);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and the app icons/manifest
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.png|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt).*)"],
};
