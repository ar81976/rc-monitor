import { isAuthorised, deny } from "./_lib.js";
import { readFeed } from "./_store.js";

// GET /api/petitions -> { connected, error?, updated, items: [{ company, petitioner, hearing, court, isNew, url }] }
// Items arrive from Petition Watch after each run (POST /api/feed?name=petitions), or from
// PETITION_WATCH_FEED_URL if Petition Watch publishes a feed address instead.
// Item format: { company, petitioner, hearing_date, court, gazette_date, status, url }

export default async function handler(req, res) {
  if (!isAuthorised(req)) return deny(res);
  const f = await readFeed("petitions", "PETITION_WATCH_FEED_URL", "PETITION_WATCH_FEED_TOKEN");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const items = f.items.slice(0, 8).map(p => ({
    company: String(p.company || "").slice(0, 120),
    petitioner: String(p.petitioner || "").slice(0, 80),
    hearing: p.hearing_date || null,
    court: String(p.court || "").slice(0, 110),
    isNew: p.status === "new" || p.gazette_date === today || p.presented_date === today,
    url: /^https?:\/\//.test(p.url || "") ? p.url : "",
  })).filter(p => p.company);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.status(200).json({ connected: f.connected, error: !!f.error, updated: f.updated || null, items });
}
