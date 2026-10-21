import { MARKETS } from "./_markets.js";
import { isAuthorised, deny } from "./_lib.js";

// GET /api/markets -> { available, delayed, updated, quotes: [{ name, idx, price, change, pct }], problems }
// Uses EODHD's delayed "live" prices. Needs the EODHD_API_TOKEN environment variable;
// without it the ticker says prices are not connected rather than showing made-up numbers.
// Prices are asked for in small batches, so one slow or unsupported code can't stop the rest.
// If a batch is refused, its codes are tried one by one; any that still fail are listed under
// "problems" (with EODHD's reply) so they can be corrected in _markets.js.
// Cached at Vercel's edge for 5 minutes.

const BATCH = 10;

async function ask(codes, token) {
  const [first, ...rest] = codes;
  const url = `https://eodhd.com/api/real-time/${encodeURIComponent(first)}?${rest.length ? `s=${rest.map(encodeURIComponent).join(",")}&` : ""}api_token=${encodeURIComponent(token)}&fmt=json`;
  let r;
  try { r = await fetch(url, { signal: AbortSignal.timeout(9000) }); }
  catch (e) { return { ok: false, why: e.name === "TimeoutError" ? "timed out" : "could not connect" }; }
  const text = await r.text();
  if (!r.ok) return { ok: false, why: `HTTP ${r.status}: ${text.slice(0, 160).replace(/\s+/g, " ")}` };
  try { const d = JSON.parse(text); return { ok: true, data: Array.isArray(d) ? d : [d] }; }
  catch { return { ok: false, why: `unexpected reply: ${text.slice(0, 160).replace(/\s+/g, " ")}` }; }
}

export default async function handler(req, res) {
  if (!isAuthorised(req)) return deny(res);
  const token = (process.env.EODHD_API_TOKEN || "").trim();
  res.setHeader("Cache-Control", "private, max-age=60");
  if (!token) {
    return res.status(200).json({ available: false, reason: "no_key", quotes: [] });
  }
  const codes = MARKETS.map(m => m.code);
  const batches = [];
  for (let i = 0; i < codes.length; i += BATCH) batches.push(codes.slice(i, i + BATCH));

  const rows = [];
  const problems = [];
  await Promise.all(batches.map(async b => {
    const got = await ask(b, token);
    if (got.ok) { rows.push(...got.data); return; }
    // Refused or failed: try each code on its own to find the one EODHD won't give.
    const singles = await Promise.all(b.map(c => ask([c], token).then(x => ({ c, x }))));
    for (const { c, x } of singles) {
      if (x.ok) rows.push(...x.data); else problems.push({ code: c, why: x.why });
    }
  }));

  const byCode = new Map(rows.map(d => [String(d.code).toUpperCase(), d]));
  const hasPrice = d => d && Number.isFinite(Number(d.close)) && Number(d.close) !== 0;
  const found = new Map(MARKETS.map(m => [m.code, byCode.get(m.code.toUpperCase())]));

  // No live price under the main code: try the alternative codes, one at a time.
  await Promise.all(MARKETS.filter(m => !hasPrice(found.get(m.code)) && m.alt?.length).map(async m => {
    for (const c of m.alt) {
      const x = await ask([c], token);
      const d = x.ok && x.data.find(r => String(r.code).toUpperCase() === c.toUpperCase());
      if (hasPrice(d)) { found.set(m.code, d); return; }
    }
  }));
  // Daily figures (gold, Brent): latest close, with the change on the day before.
  await Promise.all(MARKETS.filter(m => !hasPrice(found.get(m.code)) && m.eod).map(async m => {
    const from = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    const url = `https://eodhd.com/api/eod/${encodeURIComponent(m.code)}?from=${from}&order=d&api_token=${encodeURIComponent(token)}&fmt=json`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const t = await r.text();
      if (!r.ok) { problems.push({ code: m.code + " (daily)", why: `HTTP ${r.status}: ${t.slice(0, 160).replace(/\s+/g, " ")}` }); return; }
      const rowsD = JSON.parse(t).filter(x => Number.isFinite(Number(x.close)));
      if (!rowsD.length) return;
      const now = Number(rowsD[0].close), prev = rowsD[1] ? Number(rowsD[1].close) : now;
      found.set(m.code, { code: m.code, close: now, change: now - prev, change_p: prev ? (now - prev) / prev * 100 : 0 });
    } catch { problems.push({ code: m.code + " (daily)", why: "could not connect" }); }
  }));

  // Still nothing: use the tracker fund's move for the day (shown as a % move, without a level).
  await Promise.all(MARKETS.filter(m => !hasPrice(found.get(m.code)) && m.proxy).map(async m => {
    const x = await ask([m.proxy], token);
    const d = x.ok && x.data.find(r => String(r.code).toUpperCase() === m.proxy.toUpperCase());
    if (hasPrice(d)) found.set(m.code, { ...d, _pct: true });
  }));
  const quotes = [];
  for (const m of MARKETS) {
    const d = found.get(m.code);
    const price = Number(d?.close);
    if (!d || !Number.isFinite(price) || price === 0) {
      if (!problems.some(p => p.code === m.code)) problems.push({ code: m.code, why: d ? "no price (code not recognised, or not in this plan)" : "no reply for this code" });
      continue;
    }
    quotes.push({ name: m.name, idx: !!m.idx, group: m.group || null, kind: d._pct ? "pct" : (m.kind || null), unit: m.unit || "", dp: m.dp ?? 2, price, change: Number(d.change) || 0, pct: Number(d.change_p) || 0 });
  }
  const ok = new Set(MARKETS.filter(m => hasPrice(found.get(m.code))).map(m => m.code));
  for (let i = problems.length - 1; i >= 0; i--) if (ok.has(problems[i].code)) problems.splice(i, 1);
  // Share one answer between all screens: 10 minutes when prices came back, 2 minutes when they did not
  // (so a problem is not retried by every screen every few seconds).
  res.setHeader("CDN-Cache-Control", quotes.length ? "s-maxage=600, stale-while-revalidate=1800" : "s-maxage=120");
  res.status(200).json({
    available: quotes.length > 0,
    reason: quotes.length ? undefined : (problems.some(p => /HTTP 402/.test(p.why)) ? "limit" : "provider_error"),
    delayed: true,
    updated: Date.now(),
    quotes,
    problems,
  });
}
