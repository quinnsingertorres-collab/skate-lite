// Signed session cookies (HMAC-SHA256 via Web Crypto, so it runs in middleware and API routes).
export const COOKIE = "sk8_session";
export const SESSION_DAYS = 30;
export const RECHECK_SECS = 15 * 60; // re-confirm the account is still approved this often

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function secret() {
  const s = process.env.AUTH_SECRET || "";
  return s.length >= 32 ? s : null;
}

async function hmac(data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function authConfigured() {
  return !!secret();
}

/** payload: { id, role, ver } */
export async function signSession(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, chk: now, exp: now + SESSION_DAYS * 86400 };
  const data = b64url(enc.encode(JSON.stringify(body)));
  return `${data}.${await hmac(data)}`;
}

export async function verifySession(token) {
  if (!token || !secret()) return null;
  const [data, sig] = String(token).split(".");
  if (!data || !sig) return null;
  const expected = await hmac(data);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(fromB64url(data)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSecs = SESSION_DAYS * 86400) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSecs}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
