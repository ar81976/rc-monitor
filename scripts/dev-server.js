// Local preview: `npm run dev`, then open http://localhost:3000
// Serves public/ and runs the api/ handlers the same way Vercel does.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml" };
const PORT = Number(process.env.PORT) || 3000;

function shim(res) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
    try {
      const mod = await import(path.join(root, "api", name + ".js"));
      let body = "";
      for await (const chunk of req) body += chunk;
      req.body = body ? (() => { try { return JSON.parse(body); } catch { return body; } })() : undefined;
      return await mod.default(req, shim(res));
    } catch (e) {
      res.statusCode = 404; return res.end("not found");
    }
  }
  let p = path.join(root, "public", decodeURIComponent(url.pathname));
  if (!p.startsWith(path.join(root, "public"))) { res.statusCode = 403; return res.end(); }
  try {
    if ((await fs.stat(p)).isDirectory()) p = path.join(p, "index.html");
    res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
    res.end(await fs.readFile(p));
  } catch {
    res.statusCode = 404; res.end("not found");
  }
}).listen(PORT, () => console.log(`Redfern Cavendish Monitor running at http://localhost:${PORT}`));
