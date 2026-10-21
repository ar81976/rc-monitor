import { isAuthorised, deny } from "./_lib.js";
import { readFeed } from "./_store.js";

// GET /api/cases -> { connected, error?, updated, items: [{ title, caseNo, court, issued, unrep, url }] }
// Items arrive from Case Monitor after each run (POST /api/feed?name=cases), or from
// CASE_MONITOR_FEED_URL if it publishes a feed address instead.
// Item format: { title, case_no, court, issued_date, unrepresented, url }
// "unrepresented" names the party without a solicitor (e.g. "Defendant"); empty when all are represented.

export default async function handler(req, res) {
  if (!isAuthorised(req)) return deny(res);
  const f = await readFeed("cases", "CASE_MONITOR_FEED_URL", "CASE_MONITOR_FEED_TOKEN");
  const items = f.items.slice(0, 8).map(c => ({
    title: String(c.title || "").slice(0, 140),
    caseNo: String(c.case_no || "").slice(0, 40),
    court: String(c.court || "").slice(0, 110),
    issued: c.issued_date || null,
    unrep: c.unrepresented ? String(c.unrepresented === true ? "Party" : c.unrepresented).slice(0, 30) : "",
    url: /^https?:\/\//.test(c.url || "") ? c.url : "",
  })).filter(c => c.title);
  res.setHeader("Cache-Control", "private, max-age=60");
  res.status(200).json({ connected: f.connected, error: !!f.error, updated: f.updated || null, items });
}
