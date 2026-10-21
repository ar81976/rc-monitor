// Small key-value store for what Petition Watch and Case Monitor send in.
// Uses Upstash Redis over its REST interface (free plan is plenty). Add it in Vercel:
// Project → Storage → Upstash for Redis, which sets KV_REST_API_URL and KV_REST_API_TOKEN.
// (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN also work.)

function cfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
export function storeReady() { return !!cfg(); }

async function cmd(args) {
  const c = cfg();
  if (!c) throw new Error("no_store");
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`store HTTP ${r.status}`);
  return (await r.json()).result;
}
export async function getFeed(name) {
  const raw = await cmd(["GET", `rcmon:feed:${name}`]);
  return raw ? JSON.parse(raw) : null;
}
export async function putFeed(name, value) {
  await cmd(["SET", `rcmon:feed:${name}`, JSON.stringify(value)]);
}

// Where a panel's items come from, in order:
//  1. what the tool last sent in (POST /api/feed), when the store is set up;
//  2. otherwise a feed address the tool publishes (<NAME>_FEED_URL), read on demand.
// Returns { connected, error, updated, items }.
export async function readFeed(name, urlEnv, tokenEnv) {
  if (storeReady()) {
    try {
      const v = await getFeed(name);
      if (v) return { connected: true, updated: v.received, items: v.items || [] };
    } catch { return { connected: true, error: true, items: [] }; }
  }
  const url = process.env[urlEnv];
  if (!url) return { connected: false, items: [] };
  try {
    const headers = { Accept: "application/json" };
    if (process.env[tokenEnv]) headers.Authorization = `Bearer ${process.env[tokenEnv]}`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return { connected: true, updated: Date.now(), items: data.items || [] };
  } catch { return { connected: true, error: true, items: [] }; }
}
