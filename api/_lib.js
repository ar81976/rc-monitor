import crypto from "node:crypto";

// ---------- PIN sign-in ----------
// APP_PIN unset  -> the monitor is open to anyone with the address.
// APP_PIN set    -> data needs a session cookie, issued by /api/login for the right PIN.
const COOKIE = "rc_session";
const YEAR = 60 * 60 * 24 * 365;

function secret() {
  return process.env.SESSION_SECRET || process.env.APP_PIN || "";
}
function sign(value) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}
export function makeSessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + YEAR;
  const v = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${v}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}
// The office monitor runs without a PIN (set USE_PIN to true to bring it back).
const USE_PIN = false;
export function isAuthorised(req) {
  if (!USE_PIN || !process.env.APP_PIN) return true;
  const raw = (req.headers.cookie || "").split(/;\s*/).find(c => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
export function pinMatches(pin) {
  // Spaces or a line break typed around the PIN (in Vercel or on the sign-in screen) are ignored.
  const want = String(process.env.APP_PIN || "").trim();
  const a = Buffer.from(String(pin || "").trim()), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function deny(res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({ error: "pin_required" });
}

// ---------- RSS / Atom ----------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}
function atomLink(block) {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)
           || block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return alt ? decode(alt[1]) : "";
}
export function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[0];
    const title = tag(b, "title");
    if (!title) continue;
    const link = tag(b, "link") || atomLink(b);
    const when = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const t = when ? Date.parse(when) : NaN;
    // The feed's own section labels (RSS <category>, Atom <category term>), used to leave out sport.
    const cats = [...b.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map(c => decode(c[1]))
      .concat([...b.matchAll(/<category[^>]*\sterm=["']([^"']+)["']/gi)].map(c => decode(c[1]))).filter(Boolean);
    items.push({ title, link: /^https?:\/\//.test(link) ? link : "", time: Number.isFinite(t) ? t : null, cats });
  }
  return items;
}
