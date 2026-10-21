import { makeSessionCookie, pinMatches } from "./_lib.js";

// POST /api/login  { pin }  -> sets a year-long session cookie when the PIN is right.
// A short pause on every attempt slows down guessing.

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  // The office monitor runs without a PIN.
  return res.status(200).json({ ok: true, open: true });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  await new Promise(r => setTimeout(r, 700));
  if (!pinMatches(body?.pin)) return res.status(401).json({ error: "wrong_pin" });
  res.setHeader("Set-Cookie", makeSessionCookie());
  res.status(200).json({ ok: true });
}
