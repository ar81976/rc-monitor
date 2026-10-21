import crypto from "node:crypto";
import { putFeed, storeReady } from "./_store.js";

// POST /api/feed?name=petitions   or   ?name=cases
// Called by Petition Watch / Case Monitor after each run, with
//   Authorization: Bearer <FEED_PUSH_TOKEN>
//   body: { "items": [ ... ] }   (formats in README section 5)
// Replaces what the panel shows. Only those two names are accepted.

const NAMES = new Set(["petitions", "cases"]);
const MAX_ITEMS = 50;
const MAX_BYTES = 200_000;

function tokenOk(req) {
  const want = process.env.FEED_PUSH_TOKEN || "";
  const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got), b = Buffer.from(want);
  return want.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!tokenOk(req)) return res.status(401).json({ error: "bad_token" });
  const name = String(req.query?.name || new URL(req.url, "http://x").searchParams.get("name") || "");
  if (!NAMES.has(name)) return res.status(400).json({ error: "unknown_feed" });
  if (!storeReady()) return res.status(503).json({ error: "store_not_set_up" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.items)) return res.status(400).json({ error: "items_missing" });
  const items = body.items.slice(0, MAX_ITEMS).filter(i => i && typeof i === "object");
  const value = { received: Date.now(), items };
  if (JSON.stringify(value).length > MAX_BYTES) return res.status(413).json({ error: "too_large" });

  await putFeed(name, value);
  res.status(200).json({ ok: true, stored: items.length });
}
