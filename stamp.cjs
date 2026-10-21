// Stamps a fresh version into public/index.html (asset names) and public/version.json, so every
// screen, including TV browsers that pin pages in their cache, picks up the new publish.
const fs = require("fs");
const v = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").slice(0, 12); // yyyymmddHHMM
let h = fs.readFileSync("public/index.html", "utf8");
h = h.replace(/\?v=[0-9]+"/g, `?v=${v}"`);
fs.writeFileSync("public/index.html", h);
fs.writeFileSync("public/version.json", `{ "v": "${v}" }\n`);
console.log("version " + v);
