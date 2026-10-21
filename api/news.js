import { FEEDS, ITEMS_PER_FEED } from "./_feeds.js";
import { parseFeed, isAuthorised, deny } from "./_lib.js";

// GET /api/news -> { updated, items: [{ desk, source, title, link, time }], failed: [ids] }
// Fetched on the server so browsers and the Fire TV make one small request.
// Cached at Vercel's edge for 5 minutes, so the source sites are asked at most ~12 times an hour.

// Sport (and anything a feed's own "skip" rule names) is left out: City AM's business feed, for one,
// carries its sport desk too.
const SPORT = /^(sport|sports|golf|football|cricket|rugby|rugby union|rugby league|tennis|boxing|racing|horse racing|formula 1|f1|motorsport|olympics|athletics|cycling|snooker|darts)$/i;
function skipped(f, i) {
  const cats = i.cats || [];
  if (cats.some(c => SPORT.test(c))) return true;
  if (f.skip && cats.some(c => f.skip.test(c))) return true;
  return false;
}

async function fetchFeed(f) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(f.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "RedfernCavendishMonitor/1.0 (+https://www.redcav.com)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseFeed(await r.text()).filter(i => !skipped(f, i)).slice(0, ITEMS_PER_FEED);
    return items.map(({ cats, ...i }) => ({ desk: f.desk, source: f.source, ...i }));
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (!isAuthorised(req)) return deny(res);
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const failed = [];
  const seen = new Set();
  const items = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") { failed.push(FEEDS[i].id); return; }
    for (const it of r.value) {
      const key = it.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
    }
  });
  items.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  res.setHeader("Cache-Control", "private, max-age=60");
  res.setHeader("CDN-Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ updated: Date.now(), items, failed });
}
