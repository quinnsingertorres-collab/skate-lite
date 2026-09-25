// Requires sign-in for every page and data request (Next.js 16 "proxy", formerly middleware).
import { NextResponse } from "next/server";
import { COOKIE, RECHECK_SECS, cookieOptions, signSession, verifySession } from "@/lib/session";
import { dbConfigured, k, redis } from "@/lib/db";

const PUBLIC_PATHS = ["/signin", "/api/auth/signin", "/api/auth/setup", "/api/auth/signout"];

async function adminVersion() {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(process.env.ADMIN_PASSWORD || ""));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

// Is this session still valid? (account still approved, not reset/disabled, admin password unchanged)
async function stillValid(s) {
  if (s.role === "admin") return s.id === (process.env.ADMIN_ID || "").trim() && s.ver === (await adminVersion());
  if (!dbConfigured()) return false;
  const [status, ver] = (await redis("HMGET", k(`u:${s.id}`), "status", "ver")) || [];
  return status === "approved" && Number(ver) === Number(s.ver);
}

function deny(req) {
  const isApi = req.nextUrl.pathname.startsWith("/api/") || req.nextUrl.pathname.startsWith("/data/");
  const res = isApi
    ? NextResponse.json({ error: "Sign in required" }, { status: 401 })
    : NextResponse.redirect(new URL(`/signin${req.nextUrl.pathname !== "/" ? `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}` : ""}`, req.url));
  res.headers.append("Set-Cookie", `${COOKIE}=; ${cookieOptions(0)}`);
  return res;
}

export async function proxy(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!session) return deny(req);

  // Admin pages and APIs: admins only
  if ((pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) && session.role !== "admin") {
    return pathname.startsWith("/api/") ? NextResponse.json({ error: "Admins only" }, { status: 403 }) : NextResponse.redirect(new URL("/", req.url));
  }

  // Every so often, re-confirm the account and roll the cookie forward
  const now = Math.floor(Date.now() / 1000);
  if (now - (session.chk || 0) > RECHECK_SECS) {
    let ok = false;
    try { ok = await stillValid(session); } catch { ok = true; /* database hiccup: don't lock people out */ }
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
