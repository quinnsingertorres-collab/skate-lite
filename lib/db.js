// Minimal Upstash Redis REST client (works in API routes and middleware).
// Connect Upstash Redis to the Vercel project and it adds KV_REST_API_URL / KV_REST_API_TOKEN
// (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
const URL_ = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

// All keys get a prefix so sk8 lite can share a database with other projects safely.
const PREFIX = process.env.DB_KEY_PREFIX ?? "sk8lite:";
export const k = (key) => `${PREFIX}${key}`;

export function dbConfigured() {
  return !!(URL_ && TOKEN);
}

export async function redis(...cmd) {
  if (!dbConfigured()) throw new Error("Database not configured");
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `Redis ${res.status}`);
  return body.result;
}

// HGETALL returns a flat [k, v, k, v] list over REST
export async function hgetall(key) {
  const r = await redis("HGETALL", key);
  if (!r || !r.length) return null;
  const o = {};
  for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1];
  return o;
}
