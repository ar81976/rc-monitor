import { isAuthorised, deny } from "./_lib.js";

// GET /api/live?c=<YouTube channel ID> -> { videoId, title, watching, live, via }
// Looks up which video a broadcaster is streaming right now, so the monitor can embed that exact
// stream. (YouTube's "embed whatever the channel is streaming" shortcut refuses channels that run
// several streams at once, such as Sky News.)
// Broadcasters schedule each programme as its own stream, and the channel's "live" link often points
// at the NEXT programme before it starts. So the channel's own list of streams is read, and of the
// streams on air right now the one with the most viewers is chosen: that is the rolling news stream.
// Cached at the edge for 2 minutes.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function page(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9", "Cookie": "SOCS=CAI; CONSENT=YES+cb" },
    redirect: "follow",
    signal: AbortSignal.timeout(9000),
  });
  return r.text();
}

function count(s) {
  const m = /([\d.,]+)\s*([kKmM]?)\s*watching/.exec(s || "");
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, "")) || 0;
  return m[2].toLowerCase() === "m" ? n * 1e6 : m[2].toLowerCase() === "k" ? n * 1e3 : n;
}

// Streams on air now, from the channel's /streams list. Handles YouTube's current markup (lockups
// with a contentId and "N watching" line) and the older one (videoRenderer with a LIVE badge).
function onAir(html) {
  const found = new Map();
  let m;
  const lockup = /"contentId":"([\w-]{11})"/g;
  while ((m = lockup.exec(html))) {
    const seg = html.slice(Math.max(0, m.index - 7000), m.index);
    const meta = (seg.match(/"content":"([^"]*watching[^"]*)"/g) || []).pop();
    if (!meta) continue;
    const before = seg.slice(0, seg.lastIndexOf(meta));
    const title = (before.match(/"title":\{"content":"([^"]{0,120})"/g) || []).pop();
    found.set(m[1], { watching: count(meta), title: title ? title.replace(/^"title":\{"content":"/, "").replace(/"$/, "") : "" });
  }
  const old = /"videoId":"([\w-]{11})"[\s\S]{0,12000}?"style":"LIVE"/g;
  while ((m = old.exec(html))) {
    if (!found.has(m[1])) {
      const seg = html.slice(m.index, m.index + 12000);
      const vc = (seg.match(/"(?:simpleText|text)":"([^"]*watching[^"]*)"/) || [])[1];
      found.set(m[1], { watching: count(vc), title: "" });
    }
  }
  return [...found].map(([videoId, v]) => ({ videoId, ...v })).sort((a, b) => b.watching - a.watching);
}

export default async function handler(req, res) {
  if (!isAuthorised(req)) return deny(res);
  const c = String(req.query?.c || "").trim();
  res.setHeader("Cache-Control", "private, max-age=60");
  if (!/^UC[\w-]{20,}$/.test(c)) return res.status(400).json({ error: "bad_channel" });
  try {
    let out = null;
    try {
      const list = onAir(await page(`https://www.youtube.com/channel/${c}/streams`));
      if (list.length) out = { ...list[0], live: true, via: "streams" };
    } catch {}
    if (!out) {
      // Fall back to the channel's "live" link, but only if it is on air rather than scheduled.
      const html = await page(`https://www.youtube.com/channel/${c}/live`);
      const canon = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
      const videoId = canon ? canon[1] : (html.match(/"videoId":"([\w-]{11})"/) || [])[1] || null;
      const upcoming = /"isUpcoming":true/.test(html);
      out = { videoId: upcoming ? null : videoId, title: "", watching: 0, live: !upcoming && !!videoId, via: "live-page", upcoming };
    }
    res.setHeader("CDN-Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json(out);
  } catch {
    res.status(200).json({ videoId: null, live: false, error: "lookup_failed" });
  }
}
