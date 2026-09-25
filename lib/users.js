// Accounts: IDs are created by the admin ("invited"), the person sets a password ("pending"),
// the admin approves ("approved"). Passwords are hashed with scrypt; nothing is stored in plain text.
import crypto from "node:crypto";
import { hgetall, k, redis } from "@/lib/db";

const MAX_FAILS = 5;
const LOCK_SECS = 15 * 60;
export const STATUSES = ["invited", "pending", "approved", "disabled"];

const key = (id) => k(`u:${id}`);
const USERS = k("users");
const fail = (id) => k(`fail:${id}`);
export const cleanId = (id) => String(id || "").trim();
export const validId = (id) => /^\d{3,10}$/.test(id);

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, buf) => (err ? reject(err) : resolve(buf.toString("hex"))))
  );
}

function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- Admin (you): set ADMIN_ID + ADMIN_PASSWORD in Vercel. Not stored in the database.
export function adminId() {
  return cleanId(process.env.ADMIN_ID);
}
export function adminVersion() {
  return crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD || "").digest("hex").slice(0, 12);
}
export function isAdminLogin(id, password) {
  const aid = adminId(), apw = process.env.ADMIN_PASSWORD || "";
  return !!aid && apw.length >= 8 && id === aid && sameText(password, apw);
}

// ---- Users
export async function getUser(id) {
  const u = await hgetall(key(id));
  return u ? { ...u, ver: Number(u.ver || 0) } : null;
}

export function publicUser(u) {
  const { pw, salt, ...rest } = u;
  return rest;
}

export async function listUsers() {
  const ids = (await redis("SMEMBERS", USERS)) || [];
  const users = await Promise.all(ids.map(getUser));
  return users.filter(Boolean).map(publicUser).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export async function createId({ id, name }) {
  let newId = cleanId(id);
  if (newId) {
    if (!validId(newId)) throw new Error("ID must be 3–10 digits");
    if (newId === adminId()) throw new Error("That ID is reserved");
    if (await redis("EXISTS", key(newId))) throw new Error("That ID already exists");
  } else {
    for (let i = 0; i < 20; i++) {
      const candidate = String(crypto.randomInt(100000, 1000000));
      if (candidate !== adminId() && !(await redis("EXISTS", key(candidate)))) { newId = candidate; break; }
    }
    if (!newId) throw new Error("Couldn't generate an ID, try again");
  }
  const now = Date.now();
  await redis("HSET", key(newId), "id", newId, "name", String(name || "").trim().slice(0, 60), "status", "invited", "ver", "1", "createdAt", String(now));
  await redis("SADD", USERS, newId);
  return publicUser(await getUser(newId));
}

/** Person with an invited ID chooses a password; the account then waits for approval. */
export async function requestAccount(id, password) {
  const u = await getUser(id);
  if (!u || u.status !== "invited") return { ok: false, error: "That ID can't be set up. Check the ID number, or ask the admin for one." };
  const salt = crypto.randomBytes(16).toString("hex");
  const pw = await scrypt(password, salt);
  await redis("HSET", key(id), "pw", pw, "salt", salt, "status", "pending", "requestedAt", String(Date.now()));
  return { ok: true };
}

export async function checkPassword(u, password) {
  if (!u?.pw || !u?.salt) return false;
  return sameText(await scrypt(password, u.salt), u.pw);
}

export async function isLocked(id) {
  return Number((await redis("GET", fail(id))) || 0) >= MAX_FAILS;
}
export async function recordFail(id) {
  const n = await redis("INCR", fail(id));
  if (Number(n) === 1) await redis("EXPIRE", fail(id), LOCK_SECS);
}
export async function clearFails(id) {
  await redis("DEL", fail(id));
}

export async function setStatus(id, status) {
  if (!STATUSES.includes(status)) throw new Error("Bad status");
  const u = await getUser(id);
  if (!u) throw new Error("No such ID");
  const fields = ["status", status, "ver", String(u.ver + 1)];
  if (status === "approved") fields.push("approvedAt", String(Date.now()));
  await redis("HSET", key(id), ...fields);
  return publicUser(await getUser(id));
}

/** Clears the password so the person can set a new one (back to "invited"). */
export async function resetUser(id) {
  const u = await getUser(id);
  if (!u) throw new Error("No such ID");
  await redis("HDEL", key(id), "pw", "salt");
  await redis("HSET", key(id), "status", "invited", "ver", String(u.ver + 1));
  await clearFails(id);
  return publicUser(await getUser(id));
}

export async function renameUser(id, name) {
  await redis("HSET", key(id), "name", String(name || "").trim().slice(0, 60));
  return publicUser(await getUser(id));
}

export async function deleteUser(id) {
  await redis("DEL", key(id));
  await redis("SREM", USERS, id);
  await clearFails(id);
}

export async function touchLogin(id) {
  await redis("HSET", key(id), "lastLogin", String(Date.now()));
}
