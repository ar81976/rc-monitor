/* Redfern Cavendish Monitor — browser app (desktop, phone, Fire TV). */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  // ---------- Live update bookkeeping ----------
  // This copy of the script notes every timer and window/document listener it starts, so that when a
  // newer copy is published it can be stopped cleanly and the new one run in its place without the
  // page navigating (see verCheck): the browser's bar stays hidden and the sound stays on.
  const VER = (() => { const m = /[?&]v=(\d+)/.exec((document.currentScript && document.currentScript.src) || "") || /[?&]v=(\d+)/.exec((document.querySelector('link[href*="app.css"]') || {}).href || ""); return m ? m[1] : ""; })();
  const _timers = [], _subs = [];
  const setInterval = (fn, ms) => { const id = window.setInterval(fn, ms); _timers.push(id); return id; };
  const listen = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); _subs.push([t, ev, fn, o]); };
  const CH = window.RC_CHANNELS || [];
  const PLAYABLE = CH.filter(c => c.youtube);
  const isFireTV = /\bAFT/i.test(navigator.userAgent);
  const DESKS = { biz: "Business", pol: "Politics", brk: "UK headlines", ins: "Insolvency & courts" };
  const REFRESH_MS = 5 * 60 * 1000;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "");

  let news = [];
  let deskFilter = "all";
  let main = store.get("rc-main3", "sky"); // Sky News on the main screen unless another is chosen
  if (!CH.some(c => c.id === main)) main = (PLAYABLE[0] || CH[0] || {}).id;
  let muted = !store.get("rc-sound", false); // remembered: once sound is turned on it stays on

  // ---------- time ----------
  const tz = "Europe/London";
  function hhmm(t) {
    if (!t) return "";
    const d = new Date(t), now = new Date();
    const sameDay = d.toLocaleDateString("en-GB", { timeZone: tz }) === now.toLocaleDateString("en-GB", { timeZone: tz });
    return sameDay
      ? d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" });
  }
  function tick() {
    const n = new Date();
    $("#clock").innerHTML = `${n.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })} · London <b>${n.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}</b>`;
  }
  tick(); setInterval(tick, 15000);

  // ---------- tabs ----------
  function show(v) {
    document.querySelectorAll("nav button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.v === v)));
    document.querySelectorAll(".view").forEach(s => { s.hidden = s.id !== "v-" + v; });
    store.set("rc-tab", v);
  }
  document.querySelector("nav").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.v); });
  const hash = location.hash.slice(1);
  show(["overview", "desk", "tv"].includes(hash) ? hash : store.get("rc-tab", "overview"));

  // ---------- news ----------
  function li(n) {
    const href = safeUrl(n.link);
    const inner = `<span class="meta"><span class="src">${esc(n.source)}</span><span class="tm">${esc(hhmm(n.time))}</span></span><span class="hl">${esc(n.title)}</span>`;
    return `<li>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="row">${inner}</div>`}</li>`;
  }
  function renderNews() {
    for (const d of Object.keys(DESKS)) {
      const el = $("#ov-" + d);
      const items = news.filter(n => n.desk === d).slice(0, document.body.classList.contains("fit") ? 18 : 7);
      el.innerHTML = items.length ? items.map(li).join("") : `<li class="empty">No stories at the moment.</li>`;
    }
    renderDesk();
    renderCrawl();
    requestAnimationFrame(() => paginate());
  }
  function renderDesk() {
    const pool = news.filter(n => deskFilter === "all" || n.desk === deskFilter);
    const sources = [...new Set(pool.map(n => n.source))];
    $("#desk").innerHTML = sources.length ? sources.map(s =>
      `<div class="panel"><div class="ph"><h2>${esc(s)}</h2></div><ul class="list">${pool.filter(n => n.source === s).slice(0, 8).map(li).join("")}</ul></div>`
    ).join("") : `<p class="empty">No stories at the moment.</p>`;
  }
  $("#chips").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    deskFilter = b.dataset.f;
    document.querySelectorAll("#chips button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderDesk();
  });
  // Breaking items from the firm's own tools lead the band: today's winding-up petitions from Petition
  // Watch and today's High Court filings from Case Monitor, each with a pulsing flag, then the company
  // and the court details. Each runs through the band three times and then drops out (see alertCheck).
  let alerts = [];
  function alertHtml(a) {
    return `<span class="hi alert ${a.kind}"><span class="brk">${esc(a.flag)}</span><span class="h">${esc(a.title)}</span>${a.detail ? `<span class="t">${esc(a.detail)}</span>` : ""}</span><span class="vr" aria-hidden="true"></span>`;
  }
  // Headlines about a business failing, or insolvencies rising, are picked out of the news feeds and
  // run next, with a gold Insolvency tag. The test is deliberately narrow: words and phrases that only ever
  // mean a company or a person has failed or is about to (a government's "administration" is screened
  // out first), or that a business has collapsed.
  const INSOL_NOT = /\b(?:trump|biden|harris|obama|bush|clinton|vance|starmer|sunak|labour|tory|conservative|reform|us|u\.s\.|american|federal|state|white house|new|previous|current|incoming|outgoing|last|next|the|his|her|their|public|local|school|hospital|nhs)\b['’]?s?\s+administrations?\b/gi;
  const INSOL_YES = /\b(?:liquidat(?:ion|ors?|ed|es?)|receivership|(?:appoints?|appointed|appointing|calls? in|called in|brings? in|brought in)\s+(?:administrators?|receivers|liquidators?)|(?:administrators|receivers|liquidators)\s+(?:appointed|called in|brought in|take over|took over|lined up|sought|to be appointed)|administrators\s+(?:for|to|at|of)\b|(?:into|enters?|entered|entering|from|out of|exits?|exited|falls?|fell|slides?|slid|placed in(?:to)?|put into|goes?|went|heads?|heading|brink of|edge of|risk of|verge of|close to|near|facing|faces?|avoids?|averts?|averted|stave off|staved off|after|following|amid|despite|since|in)\s+administration|special administration|pre-?packs?|insolven(?:t|cy|cies)|winding[- ]up|wound up (?:in|by|at) (?:the )?(?:high |county |companies )?court|wound up in the public interest|wound up (?:after|following|over|owing)\b|(?:ltd|limited|plc|company|companies|firms?|business)\b.{0,40}\bwound up|bankrupt\w*|chapter 11|company voluntary arrangements?|individual voluntary arrangements?|CVAs?|IVAs?|debt relief orders?|(?:goes|gone|went|going|go)\s+bust|creditors|red flag alert|(?:critical|significant)\s+(?:financial\s+)?distress|restructuring plan|debt restructuring)\b/i;
  const INSOL_FIRM = "retailer|chain|firm|company|builder|housebuilder|airline|restaurant|pub|supplier|manufacturer|contractor|developer|lender|ltd|plc|stores?|shops?|jobs";
  const INSOL_FALL = new RegExp(`\\b(?:${INSOL_FIRM})(?:['’]s)?\\b.{0,30}\\bcollaps\\w*|\\bcollaps\\w*\\s+of\\s+(?:the\\s+|a\\s+)?(?:[\\w'’-]+\\s+){0,3}(?:${INSOL_FIRM})\\b|\\bcollapsed\\s+(?:${INSOL_FIRM})\\b`, "i");
  // The gov.uk feeds (the Insolvency & Courts desk: tribunal decisions, Insolvency Service notices and
  // statistics) stay off the band altogether; they are for the overview panel.
  const isInsolvency = n => {
    if (n.desk === "ins") return false;
    const t = String(n.title || "").replace(INSOL_NOT, "");
    return INSOL_YES.test(t) || INSOL_FALL.test(t);
  };
  function insolvencyPicks() {
    const cut = Date.now() - 48 * 3600 * 1000;
    return news.filter(n => isInsolvency(n) && (!n.time || +new Date(n.time) > cut)).slice(0, 6);
  }
  function crawlHtml() {
    const picks = insolvencyPicks();
    const items = news.filter(n => n.desk !== "ins" && !picks.includes(n)).slice(0, 24);
    if (!items.length && !alerts.length && !picks.length) return "";
    return alerts.map(alertHtml).join("")
      + picks.map(n => `<span class="hi insol"><span class="brk">Insolvency</span><span class="s">${esc(n.source)}</span><span class="h">${esc(n.title)}</span><span class="t">${esc(hhmm(n.time))}</span></span><span class="vr" aria-hidden="true"></span>`).join("")
      + items.map(n => `<span class="hi"><span class="s">${esc(n.source)}</span><span class="h">${esc(n.title)}</span><span class="t">${esc(hhmm(n.time))}</span></span><span class="vr" aria-hidden="true"></span>`).join("");
  }
  let crawlShown = null; // what the band was last drawn from, so an unchanged band is left running
  function renderCrawl() {
    const r = $("#crawl"), html = crawlHtml();
    if (!html) { r.className = "run msg"; r.textContent = "Headlines will appear here shortly."; crawlShown = null; return; }
    if (r.className === "run" && crawlShown === html) return; // unchanged: leave it running
    r.className = "run";
    r.innerHTML = html + html; crawlShown = html;
    requestAnimationFrame(() => restartScroll(r, 90));
  }
  // The bands scroll at a steady speed, so the loop's length is set from the content's width each time
  // it is drawn. The animation is stopped and started afresh rather than having its length changed
  // while running: a running animation given a new length jumps to a different point, and at the end
  // of a loop that can set off a run of jumps that looks like the band racing.
  // How the bands are moved on a TV: "js" (by script, a whole pixel at a time: right for the 2018
  // Fire TV Stick 4K, whose browser breaks up text it draws between pixels) or "css" (the browser's
  // own animation, smoother on the newer sticks). Decided by the stick's model unless set on the
  // device with ?bands=js or ?bands=css (remembered; ?bands=auto goes back to the rule).
  const OLD_STICK = /\bAFT(MM|T|N|B|M|RS|SS|KMST|A|S|KA)\b/i.test(navigator.userAgent); // 2018 4K stick and older
  function bandMode() { const pref = store.get("rc-bands", null); return pref === "js" || pref === "css" ? pref : OLD_STICK ? "js" : "css"; }
  function restartScroll(el, pxPerSec) {
    const w = el.scrollWidth / 2;
    if (document.body.classList.contains("fit") && bandMode() === "js") {
      // On the TV the bands are moved by script, a whole screen pixel at a time (see bandTick).
      el.style.animation = "none"; el.style.transform = "translateX(0)";
      if (w) bands.set(el, { x: 0, w, speed: pxPerSec, last: 0 }); else bands.delete(el);
      return;
    }
    bands.delete(el); el.style.transform = "";
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    if (w) el.style.animationDuration = (w / pxPerSec) + "s";
  }
  // The browser's own animation slides a band by fractions of a pixel each frame, and text drawn
  // between pixels breaks up on a television. On the TV the bands are moved by script instead, only
  // ever by whole screen pixels, so every frame is drawn on the pixel grid.
  const bands = new Map();
  let bandRaf = 0;
  // Each band moves the same whole number of pixels every frame (the nearest to its set speed): a
  // band that moved by time alone had to alternate one-pixel and two-pixel steps to keep its speed,
  // and that alternation shows as a judder. A frame the browser skipped is made up for with a double
  // step. The position is always a whole number of the page's own pixels: text drawn at a fraction
  // of a pixel loses pieces of its letters on the TV.
  function bandTick(now) {
    bandRaf = requestAnimationFrame(bandTick);
    bands.forEach((b, el) => {
      if (!el.isConnected) { bands.delete(el); return; }
      if (b.last) {
        const dt = Math.min(0.1, (now - b.last) / 1000);
        b.dt = b.dt ? b.dt * 0.95 + dt * 0.05 : dt; // the frame interval, smoothed (16.7 ms at 60 Hz, 20 ms at 50 Hz)
        const frames = Math.max(1, Math.min(6, Math.round(dt / b.dt)));
        const step = Math.max(1, Math.round(b.speed * b.dt));
        b.x += frames * step;
      }
      b.last = now;
      if (b.x >= b.w) { b.x -= b.w; el.dispatchEvent(new Event("animationiteration")); if (bands.get(el) !== b) return; }
      el.style.transform = `translateX(${-Math.round(b.x)}px)`;
    });
  }
  bandRaf = requestAnimationFrame(bandTick);
  async function loadNews() {
    const r = await fetch("/api/news", { credentials: "same-origin" });
    if (r.status === 401) { showGate(); return false; }
    if (!r.ok) throw new Error("news " + r.status);
    const data = await r.json();
    news = data.items || [];
    document.querySelectorAll(".upd").forEach(e => { e.textContent = "updated " + hhmm(data.updated); });
    renderNews();
    return true;
  }

  // ---------- markets ----------
  function fmt(n, dp) { return Number(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  // Indices and currencies on every loop; the share groups take turns, one per loop.
  let tapeQuotes = [], tapeGroup = 0;
  function quoteHtml(x) {
    const up = x.change >= 0, sign = up ? "+" : "−";
    // Gilt yields show the yield itself and its move in percentage points (e.g. 4.52% ▲ +0.03).
    const price = x.kind === "yield" ? fmt(x.price, 2) + "%" : (x.unit || "") + fmt(x.price, x.dp);
    // "pct": only the day's move is known (taken from a tracker fund), so no level is shown.
    if (x.kind === "pct") return `<span class="q${x.idx ? " idx" : ""}"><span class="n">${esc(x.name)}</span><span class="${up ? "u" : "d"}">${up ? "▲" : "▼"} ${sign + fmt(Math.abs(x.pct), 2) + "%"}</span></span>`;
    const move = x.kind === "yield" ? sign + fmt(Math.abs(x.change), 2) : sign + fmt(Math.abs(x.pct), 2) + "%";
    return `<span class="q${x.idx ? " idx" : ""}"><span class="n">${esc(x.name)}</span><span class="p">${price}</span><span class="${up ? "u" : "d"}">${up ? "▲" : "▼"} ${move}</span></span>`;
  }
  function renderTape() {
    const run = $("#run"); if (!tapeQuotes.length) return;
    const groups = [...new Set(tapeQuotes.filter(x => x.group).map(x => x.group))];
    const core = tapeQuotes.filter(x => !x.group);
    let html = core.map(quoteHtml).join("");
    if (groups.length) {
      const g = groups[tapeGroup % groups.length];
      html += `<span class="qg">${esc(g)}</span>` + tapeQuotes.filter(x => x.group === g).map(quoteHtml).join("");
    }
    run.className = "run";
    run.innerHTML = html + html;
    requestAnimationFrame(() => restartScroll(run, 70));
  }
  $("#run").addEventListener("animationiteration", e => { if (e.target !== e.currentTarget) return; tapeGroup++; renderTape(); });
  async function loadMarkets() {
    const run = $("#run");
    try {
      const r = await fetch("/api/markets", { credentials: "same-origin" });
      if (r.status === 401) return;
      const data = await r.json();
      if (!data.available) {
        $("#tape-lbl").textContent = "Markets";
        run.className = "run msg";
        run.textContent = data.reason === "limit" ? "Market prices are paused: today's market-data allowance is used up." : data.reason === "no_key" ? "Market prices connect once the market-data key is added." : "Market prices are unavailable at the moment.";
        return;
      }
      $("#tape-lbl").textContent = "Markets";
      tapeQuotes = data.quotes;
      renderTape();
    } catch {
      run.className = "run msg";
      run.textContent = "Market prices are unavailable at the moment.";
    }
  }

  // ---------- Petition Watch and Case Monitor ----------
  function dayLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" });
  }
  // Replace one tool's alerts (petitions or cases) and redraw the band if anything changed. An alert
  // stays on the band for an hour from when it first appears (STAY_MS), and for at least three passes,
  // then drops out for good. A pass is counted when the alert has scrolled right off the left of the
  // band, not at the end of the band's loop: the band restarts from its head whenever a headline
  // changes, so the end of a loop can be a long time coming. When it first appeared and how many
  // passes it has made are kept on the device, so an update or a restart does not reset the clock.
  const PASSES = 3, STAY_MS = 60 * 60 * 1000;
  const alertKey = a => a.kind + "|" + a.title;
  function alertMemo() {
    const d = store.get("rc-alerts", {}) || {}, cut = Date.now() - 3 * 24 * 3600 * 1000;
    for (const k in d) if (!d[k] || !(d[k].t > cut)) delete d[k];
    return d;
  }
  const isSpent = m => (m.n || 0) >= PASSES && !!m.first && Date.now() - m.first >= STAY_MS;
  try { localStorage.removeItem("rc-alerts-done"); } catch {}
  const spentKeys = new Set(); // alerts this copy of the page has dropped, in case the device cannot remember them
  function setAlerts(kind, list) {
    const memo = alertMemo(); let changed = false;
    const fresh = list.filter(a => !spentKeys.has(alertKey(a)) && !isSpent(memo[alertKey(a)] || {})).slice(0, 6)
      .map(a => {
        const k = alertKey(a), was = alerts.find(x => alertKey(x) === k) || {};
        if (!memo[k]) { memo[k] = { n: 0, t: Date.now(), first: Date.now() }; changed = true; } // the clock starts now
        else if (!memo[k].first) { memo[k].first = Date.now(); changed = true; } // counted before the clock existed: it starts now
        return { ...a, passes: Math.max(memo[k].n || 0, was.passes || 0), first: memo[k].first || Date.now(), off: !!was.off };
      });
    if (changed) store.set("rc-alerts", memo);
    const next = [...alerts.filter(a => a.kind !== kind), ...fresh];
    const sig = l => l.map(a => alertKey(a) + "|" + a.detail).join("\n");
    if (sig(next) === sig(alerts)) return;
    alerts = next; requestAnimationFrame(renderCrawl);
  }
  // How far the band has moved, in layout pixels (the script's own count on the TV; the browser's
  // animation elsewhere).
  function bandX(el) {
    const b = bands.get(el); if (b) return b.x;
    const a = el.getAnimations ? el.getAnimations()[0] : null; if (!a) return 0;
    return ((a.effect.getComputedTiming().progress || 0) * el.scrollWidth) / 2;
  }
  function alertCheck() {
    if (!alerts.length) return;
    const r = $("#crawl"), els = r.querySelectorAll(".hi.alert");
    if (!r.offsetWidth || els.length < alerts.length * 2) return; // band not shown, or not drawn yet
    const x = bandX(r);
    let spent = false;
    alerts.forEach((a, i) => {
      const el = els[i], vr = el.nextElementSibling, after = vr && vr.nextElementSibling;
      const off = !!after && after.offsetLeft <= x; // the item after it has reached the left edge
      if (off && !a.off) {
        a.off = true; a.passes = (a.passes || 0) + 1;
        const memo = alertMemo(), m = memo[alertKey(a)] || { first: a.first };
        memo[alertKey(a)] = { n: a.passes, t: Date.now(), first: m.first || a.first || Date.now() }; store.set("rc-alerts", memo);
        // Only an alert that has just scrolled off is dropped, so nothing vanishes while in view.
        if (isSpent({ n: a.passes, first: a.first })) { a.spent = true; spent = true; }
      } else if (!off) a.off = false;
    });
    if (spent) dropSpent();
  }
  function dropSpent() {
    const r = $("#crawl"), b = bands.get(r), els = [...r.querySelectorAll(".hi.alert")], n = alerts.length;
    alerts.forEach((a, i) => {
      if (!a.spent) return;
      spentKeys.add(alertKey(a));
      if (!b) return;
      // On the TV the alert is taken out of both copies of the band where it stands, and the band moved
      // back by the width taken out of the first copy, so what is on screen does not move.
      [els[i], els[i + n]].forEach((el, c) => {
        if (!el) return;
        const vr = el.nextElementSibling && el.nextElementSibling.classList.contains("vr") ? el.nextElementSibling : null;
        const after = (vr || el).nextElementSibling;
        if (c === 0 && after) b.x -= after.offsetLeft - el.offsetLeft;
        if (vr) vr.remove(); el.remove();
      });
    });
    alerts = alerts.filter(a => !a.spent);
    if (b) { b.w = r.scrollWidth / 2; if (b.x < 0) b.x = 0; crawlShown = crawlHtml(); if (!crawlShown) renderCrawl(); }
    else renderCrawl();
  }
  setInterval(alertCheck, 250);
  async function loadPetitions() {
    const el = $("#ov-pw");
    try {
      const r = await fetch("/api/petitions", { credentials: "same-origin" });
      if (r.status === 401) return;
      const d = await r.json();
      $("#p-pw").classList.toggle("nc", !d.connected); requestAnimationFrame(() => paginate());
      if (!d.connected) { setAlerts("petition", []); el.innerHTML = `<li class="connect"><b>Not connected yet.</b> Newly advertised winding-up petitions will appear here once Petition Watch's feed address is added.</li>`; return; }
      if (d.error) { el.innerHTML = `<li class="connect">Petition Watch could not be reached. It will try again shortly.</li>`; return; }
      $("#pw-note").textContent = d.items.filter(p => p.isNew).length + " new" + (d.updated ? " · " + hhmm(d.updated) : "");
      setAlerts("petition", d.items.filter(p => p.isNew).map(p => ({ kind: "petition", flag: "New petition", title: p.company,
        detail: [p.petitioner && "petition by " + p.petitioner, p.hearing && "hearing " + dayLabel(p.hearing), p.court].filter(Boolean).join(" · ") })));
      el.innerHTML = d.items.length ? d.items.map(p => {
        const det = [p.petitioner && "Petition by " + p.petitioner, p.hearing && "hearing " + dayLabel(p.hearing), p.court].filter(Boolean).join(" · ");
        const inner = `<span class="co">${p.isNew ? '<span class="flag">New</span>' : ""}${esc(p.company)}</span><span class="det">${esc(det)}</span>`;
        return `<li>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="row">${inner}</div>`}</li>`;
      }).join("") : `<li class="empty">No new petitions.</li>`;
      requestAnimationFrame(() => paginate());
    } catch { el.innerHTML = `<li class="connect">Petition Watch could not be reached. It will try again shortly.</li>`; }
  }
  async function loadCases() {
    const el = $("#ov-cm");
    try {
      const r = await fetch("/api/cases", { credentials: "same-origin" });
      if (r.status === 401) return;
      const d = await r.json();
      $("#p-cm").classList.toggle("nc", !d.connected); requestAnimationFrame(() => paginate());
      if (!d.connected) { setAlerts("case", []); el.innerHTML = `<li class="connect"><b>Not connected yet.</b> Newly filed High Court cases will appear here once Case Monitor's feed address is added.</li>`; return; }
      if (d.error) { el.innerHTML = `<li class="connect">Case Monitor could not be reached. It will try again shortly.</li>`; return; }
      $("#cm-note").textContent = d.items.filter(c => c.unrep).length + " unrepresented" + (d.updated ? " · " + hhmm(d.updated) : "");
      const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      setAlerts("case", d.items.filter(c => c.issued === today).map(c => ({ kind: "case", flag: "High Court", title: c.title,
        detail: [c.caseNo, c.court, c.unrep && c.unrep + " unrepresented"].filter(Boolean).join(" · ") })));
      el.innerHTML = d.items.length ? d.items.map(c => {
        const det = [c.caseNo, c.court, c.issued && "issued " + dayLabel(c.issued)].filter(Boolean).join(" · ");
        const inner = `<span class="co">${c.unrep ? `<span class="flag">${esc(c.unrep)} unrepresented</span>` : ""}${esc(c.title)}</span><span class="det">${esc(det)}</span>`;
        return `<li>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="row">${inner}</div>`}</li>`;
      }).join("") : `<li class="empty">No new cases.</li>`;
      requestAnimationFrame(() => paginate());
    } catch { el.innerHTML = `<li class="connect">Case Monitor could not be reached. It will try again shortly.</li>`; }
  }

  // ---------- Rain radar (RainViewer, free) on a dark map ----------
  // The last hour of rain over Lincolnshire running up to the live picture, then the half-hour forecast, with Market Rasen marked. Checks for new pictures every 5 minutes.
  const HOME = [53.3836, -0.3368]; // CWG House, Market Rasen
  let radar = null, frames = [], layers = [], frameIdx = 0, loopTimer = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // In the wide Fire TV layout the map is much wider, so it looks further west (Sheffield, Leeds and
  // York) rather than out to sea.
  function radarCentre() {
    const wideTV = document.documentElement.classList.contains("wide") && document.body.classList.contains("tv-on");
    return [HOME[0] + 0.04, HOME[1] + (wideTV ? -0.3 : 0.04)];
  }
  function initRadar() {
    const el = $("#radar");
    if (!el || !window.L || radar) return;
    // The view sits a touch north and east of the town so Lincoln, the Wolds, Grimsby, the Humber and the coast share the frame.
    radar = L.map(el, { center: radarCentre(), zoom: 8.75, zoomSnap: 0.25, zoomControl: false, attributionControl: true,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
    radar.attributionControl.setPrefix(false);
    // Dark grey map (Esri's dark canvas, no key needed), with a layer of place names on top.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 12, className: "basemap", attribution: "Map © Esri, HERE, Garmin, OpenStreetMap contributors · radar © RainViewer" }).addTo(radar);
    // Place names are drawn by the monitor itself, in house style and at a size that reads from across
    // the room, rather than the map's own small ones (which are pictures, and blur when the map is scaled).
    // [name, lat, lon, big city?, where the name sits relative to the point (centre unless the edge is near)]
    const PLACES = [
      ["Hull", 53.7446, -0.3367, 1], ["Grimsby", 53.5675, -0.0806, 1], ["Scunthorpe", 53.5809, -0.6502, 1], ["Lincoln", 53.2307, -0.5406, 1],
      ["Louth", 53.3668, -0.0048], ["Horncastle", 53.2090, -0.1164], ["Sleaford", 52.9960, -0.4100], ["Gainsborough", 53.4000, -0.7750, 0, "right"],
      ["Brigg", 53.5520, -0.4880, 0, "bottom"], ["Immingham", 53.6139, -0.2203], ["Beverley", 53.8420, -0.4270], ["Goole", 53.7040, -0.8690, 0, "right"],
      ["Newark", 53.0760, -0.8100, 0, "right"], ["Boston", 52.9740, -0.0260], ["Mablethorpe", 53.3406, 0.2600, 0, "left", [0, 14]], ["Skegness", 53.1436, 0.3360, 0, "left"],
      ["Withernsea", 53.7290, 0.0360], ["Spurn Head", 53.5780, 0.1130, 0, "top", [0, -9]], ["Retford", 53.3220, -0.9440, 0, "right"],
    ];
    const tips = PLACES.map(([name, la, lo, big, dir, off]) => L.tooltip([la, lo], { permanent: true, direction: dir || "center", offset: off || [0, 0], className: "place" + (big ? " big" : ""), opacity: 1 }).setContent(name).addTo(radar));
    // Names whose place is off the edge of the map are hidden rather than shown half cut off.
    const placeCheck = () => { const b = radar.getBounds().pad(-0.03); tips.forEach(t => { const el = t.getElement(); if (el) el.style.display = b.contains(t.getLatLng()) ? "" : "none"; }); };
    radar.on("moveend resize zoomend", placeCheck); placeCheck();
    L.circleMarker(HOME, { radius: 5, color: "#e3b96a", weight: 2, fillColor: "#b8892f", fillOpacity: 1 })
      .bindTooltip("CWG House", { permanent: true, direction: "bottom", className: "home-tip" }).addTo(radar);
    loadRadar();
  }
  async function loadRadar() {
    try {
      const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const d = await r.json();
      const past = (d.radar && d.radar.past) || [], next = (d.radar && d.radar.nowcast) || [];
      if (!past.length) throw new Error("no frames");
      // What matters is now: the last hour runs up to the live picture, which holds, then the half-hour
      // forecast plays on. Frames already on the map are kept and only new ones are fetched, a few at a
      // time, so RainViewer's free allowance (about 100 tiles a minute) is never exceeded.
      wanted = [...past.slice(-6).map(f => ({ ...f, kind: "past" })), ...next.slice(0, 3).map(f => ({ ...f, kind: "next" }))];
      tileHost = d.host;
      const keep = new Set(wanted.map(f => f.path));
      for (const [path, g] of cache) if (!keep.has(path)) { radar.removeLayer(g); cache.delete(path); }
      // Newest first, so the live picture is on screen as soon as possible.
      pending = [...wanted.filter(f => f.kind === "past").reverse(), ...wanted.filter(f => f.kind === "next")].filter(f => !cache.has(f.path));
      feed();
      $("#radar-msg").hidden = true;
    } catch {
      if (!frames.length) { $("#radar-msg").hidden = false; $("#radar-msg").textContent = "The radar is unavailable at the moment."; }
    }
  }
  // Colour scheme 4 (green, yellow, red) reads far better on a grey map than the blues, and each
  // frame is drawn twice over itself: radar pictures draw light rain faint and see-through, and the
  // second copy makes it solid without changing the colours of heavier rain.
  const cache = new Map(); let wanted = [], pending = [], tileHost = "", feedTimer = null, liveIdx = 0;
  function feed() {
    clearTimeout(feedTimer);
    const opts = { opacity: 0, tileSize: 512, zoomOffset: -1, maxNativeZoom: 7, maxZoom: 10, zIndex: 5, className: "rain" };
    const url = f => `${tileHost}${f.path}/512/{z}/{x}/{y}/4/1_1.png`;
    pending.splice(0, cache.size ? 3 : 6).forEach(f => { if (!cache.has(f.path)) cache.set(f.path, L.layerGroup([L.tileLayer(url(f), opts), L.tileLayer(url(f), opts)]).addTo(radar)); });
    const have = wanted.filter(f => cache.has(f.path));
    const cur = frames[frameIdx];
    frames = have; layers = have.map(f => cache.get(f.path));
    liveIdx = Math.max(0, have.filter(f => f.kind === "past").length - 1);
    frameIdx = cur ? Math.max(0, have.findIndex(f => f.path === cur.path)) : liveIdx;
    if (!loopTimer || !cur) { frameIdx = liveIdx; showFrame(); clearTimeout(loopTimer); loop(); } else showFrame();
    if (pending.length) feedTimer = setTimeout(feed, 30000);
  }
  function showFrame() {
    if (!frames.length) return;
    layers.forEach((g, i) => g.eachLayer(l => l.setOpacity(i === frameIdx ? 1 : 0)));
    const f = frames[frameIdx];
    const t = new Date(f.time * 1000).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    $("#radar-time").textContent = (f.kind === "next" ? "Forecast · " : frameIdx === liveIdx ? "Live · " : "") + t;
  }
  function loop() {
    if (reduce || !frames.length) return;
    // Run-up frames pass quickly; the live picture holds; forecast frames go at a slower pace, then a pause before the loop restarts.
    const f = frames[frameIdx], last = frameIdx === frames.length - 1;
    const hold = frameIdx === liveIdx ? 4000 : f.kind === "next" ? (last ? 2500 : 1200) : (document.body.classList.contains("fit") ? 800 : 500);
    loopTimer = setTimeout(() => { frameIdx = (frameIdx + 1) % frames.length; showFrame(); loop(); }, hold);
  }

  // Met Office weather warnings for the region, under the radar.
  async function loadWarnings() {
    const el = $("#wx-warn"); if (!el) return;
    try {
      const r = await fetch("/api/warnings", { credentials: "same-origin" });
      if (r.status === 401) return;
      const d = await r.json();
      if (!d.ok) { el.innerHTML = ""; return; }
      el.innerHTML = d.items.length
        ? d.items.map(w => `<li><div class="row"><span class="warn-t"><span class="flag">Met Office</span>${esc(w.title)}</span></div></li>`).join("")
        : `<li class="empty ok">No Met Office weather warnings</li>`;
    } catch { el.innerHTML = ""; }
  }

  // ---------- Channels that aren't streaming ----------
  // A broadcaster can be off air on YouTube, or stop its stream playing inside other sites.
  // The YouTube player reports this; the monitor then moves the main screen to the next channel
  // that is streaming, hides that tile, and tries the channel again after 30 minutes.
  const OFFAIR = "Not streaming right now";
  const DEAD_MS = 30 * 60 * 1000;
  const dead = new Map();
  let mainState = -1, lastEnded = 0;
  function isDead(id) { const t = dead.get(id); return !!t && Date.now() - t < DEAD_MS; }
  // Which exact video each broadcaster is streaming right now (looked up through /api/live).
  const liveIds = new Map();
  async function resolveLive(c, fresh) {
    if (!c.youtube) return null;
    const hit = liveIds.get(c.id);
    if (!fresh && hit && Date.now() - hit.t < 5 * 60 * 1000) return hit.id;
    try {
      const r = await fetch(`/api/live?c=${encodeURIComponent(c.youtube)}${fresh ? "&r=" + Date.now() : ""}`, { credentials: "same-origin" });
      const d = r.ok ? await r.json() : {};
      const id = d.videoId || null;
      liveIds.set(c.id, { id, t: Date.now() });
      return id;
    } catch { return null; }
  }
  // The privacy player (youtube-nocookie) is used everywhere; the standard player gave the 4K Max no
  // better picture. ?yt=std on a device switches to it (?yt=auto back).
  if (new URLSearchParams(location.search).get("yt")) store.set("rc-yt", new URLSearchParams(location.search).get("yt") === "auto" ? null : new URLSearchParams(location.search).get("yt"));
  const YT_STD = store.get("rc-yt", null) ? store.get("rc-yt", null) === "std" : false; // tried on the 4K Max: same 480p, and no quality report
  const YT_HOST = YT_STD ? "www.youtube.com" : "www.youtube-nocookie.com";
  const ytSrc = (c, extra, vid) => (vid
    ? `https://${YT_HOST}/embed/${encodeURIComponent(vid)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&cc_load_policy=0&origin=${encodeURIComponent(location.origin)}${YT_STD ? "&vq=hd1080" : ""}${extra || ""}`
    : `https://${YT_HOST}/embed/live_stream?channel=${encodeURIComponent(c.youtube)}&autoplay=1&mute=1&playsinline=1&enablejsapi=1&rel=0&cc_load_policy=0&origin=${encodeURIComponent(location.origin)}${YT_STD ? "&vq=hd1080" : ""}${extra || ""}`);
  // Captions off (TV browsers sometimes switch them on from the device's accessibility settings).
  function noCaptions() { command("unloadModule", ["captions"]); command("unloadModule", ["cc"]); }
  function watch(f) {
    // Ask the player to report its state; if it never starts playing, treat the channel as off air.
    const say = () => { try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: f.dataset.ch, channel: "widget" }), "*"); } catch {} };
    say(); setTimeout(say, 1500);
    clearTimeout(f._t);
    // A player that reported ready but never started within 30 seconds is treated as off air.
    // (Browsers that never report back, such as some TV browsers, are left alone.)
    f._t = setTimeout(() => {
      if (!f.isConnected || !f._ready || f._played) return;
      const ch = f.dataset.ch;
      // On the main screen, first ask again which stream the channel is on (programme handovers);
      // only if the answer is the same stream is the channel treated as off air.
      if (f.closest("#screen") && !f._retried) {
        f._retried = true;
        const before = (liveIds.get(ch) || {}).id;
        resolveLive(chan(ch), true).then(id => { if (main !== ch) return; if (id && id !== before) setMain(ch, true); else markDead(ch); });
      } else markDead(ch);
    }, 30000);
  }
  listen(window, "message", e => {
    let host = ""; try { host = new URL(e.origin).hostname; } catch { return; }
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return;
    let d; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d || !d.event) return;
    const f = [...document.querySelectorAll("iframe[data-ch]")].find(x => x.contentWindow === e.source);
    if (!f) return;
    if (d.event === "onReady" || d.event === "initialDelivery") f._ready = true;
    const st = d.event === "onStateChange" ? d.info : d.info && d.info.playerState;
    if (st === 1 || st === 3) f._played = true;
    if (typeof st === "number" && f.closest("#screen")) mainState = st;
    // A programme-stream has ended on the main screen: look up the channel's new stream and move to it.
    if (st === 0 && f.closest("#screen") && Date.now() - lastEnded > 60000) {
      lastEnded = Date.now(); const ch = f.dataset.ch;
      resolveLive(chan(ch), true).then(() => { if (main === ch) setMain(ch, true); });
    }
    if (d.info && typeof d.info.currentTime === "number" && f.closest("#screen")) mainPos = { t: d.info.currentTime, d: Number(d.info.duration) || 0, at: Date.now() };
    if (d.info && d.info.playbackQuality && f.closest("#screen")) showQuality(d.info.playbackQuality, d.info.availableQualityLevels);
    if (d.event === "onReady" && f.closest("#screen")) { setTimeout(askQuality, 1200); setTimeout(askQuality, 6000); }
    if (d.event === "onError") markDead(f.dataset.ch);
  });
  // The picture quality the player reports for the main screen, shown beside the channel name in TV
  // mode (so a soft picture can be told apart from a soft stream). The player chooses quality itself
  // from the picture size, the connection and how the device keeps up; it is asked for the best the
  // stream offers, which it treats as a suggestion.
  const QNAME = { tiny: "144p", small: "240p", medium: "360p", large: "480p", hd720: "720p", hd1080: "1080p", hd1440: "1440p", hd2160: "4K", highres: "4K+" };
  let qualityAsked = 0;
  // The picture quality wanted: full HD on computers; on the TV stick 0, which leaves the player to
  // choose (480p on the 2018 stick: anything higher drops frames in its browser, and the player then
  // dives to 144p rather than settling one step down; pinning the quality did not hold it either).
  // Changed on the device with ?hd=720, ?hd=1080 or ?hd=0 (remembered); ?hd=auto returns to this rule.
  function hdLines() { const pref = store.get("rc-hd", null); return pref !== null ? Number(pref) : document.body.classList.contains("fit") && OLD_STICK ? 0 : 1080; } // newer sticks (4K Max): full HD
  const QLEVEL = l => (l >= 1080 ? "hd1080" : l >= 720 ? "hd720" : l >= 480 ? "large" : "medium");
  function askQuality() {
    const lines = hdLines(); if (!lines) return;
    const q = QLEVEL(lines);
    if (document.body.classList.contains("fit")) command("setPlaybackQualityRange", [q, q]);
    command("setPlaybackQuality", [q]);
  }
  function showQuality(q, levels) {
    // The badge also shows the best the stream offers here, e.g. "480p of 1080p", so a limit in the
    // stream can be told apart from a limit in the player.
    const top = (levels || []).find(l => l !== "auto");
    const el = $("#lt-q"); if (el) el.textContent = (QNAME[q] || (q === "unknown" ? "" : q || "")) + (top && top !== q && QNAME[top] ? " of " + QNAME[top] : "");
    const lines = hdLines(); if (!lines) return;
    const want = (levels || []).includes(QLEVEL(lines)) ? QLEVEL(lines) : (levels || []).find(l => l !== "auto");
    if (want && q !== want && Date.now() - qualityAsked > 20000) { qualityAsked = Date.now(); askQuality(); }
  }
  // A live stream that was paused for a while carries on from where it stopped, so it runs behind.
  // Once a minute, if the main screen has drifted more than 90 seconds behind, jump it back to live.
  let mainPos = { t: 0, d: 0, at: 0 };
  setInterval(() => {
    if (mainState === 1 && mainPos.d && mainPos.d - mainPos.t > 90 && Date.now() - mainPos.at < 20000) {
      command("seekTo", [mainPos.d + 60, true]); mainPos = { t: 0, d: 0, at: 0 };
    }
  }, 60000);
  function markDead(id) {
    if (!id || isDead(id)) return;
    dead.set(id, Date.now());
    const c = chan(id);
    if (id === main) {
      const next = PLAYABLE.find(x => !isDead(x.id));
      if (next) { hint(`${c.name} isn't streaming right now`); setMain(next.id, true); }
    }
    tileKey = ""; renderTiles(); renderTV();
  }
  // Every 30 minutes, go back to the channel last chosen if it was skipped for being off air.
  setInterval(() => { const pref = store.get("rc-main3", null); if (pref && pref !== main && chan(pref).youtube && !isDead(pref)) setMain(pref, true); }, DEAD_MS + 5000);

  // ---------- TV ----------
  function chan(id) { return CH.find(c => c.id === id) || CH[0]; }
  let mainSeq = 0;
  function setMain(id, auto) {
    main = id; if (!auto) store.set("rc-main3", id);
    mainState = -1;
    const c = chan(id);
    const scr = $("#screen");
    scr.querySelector("iframe")?.remove();
    scr.querySelector(".ph-chan")?.remove();
    $("#lt-name").textContent = c.name;
    if ($("#tvname")) $("#tvname").textContent = c.name;
    if ($("#tvsound")) $("#tvsound").textContent = muted ? "Sound on" : "Sound off";
    $("#stage-link").href = c.url;
    if (c.youtube) {
      const seq = ++mainSeq;
      const f = document.createElement("iframe");
      resolveLive(c).then(vid => { if (seq === mainSeq) f.src = ytSrc(c, "&modestbranding=1", vid); });
      f.dataset.ch = c.id;
      f.title = c.name + " live";
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.allowFullscreen = true;
      // Browsers only start video silently; if sound was left on, turn it back on once the player is ready.
      f.addEventListener("load", () => {
        f._loaded = true;
        watch(f);
        // Browsers only let a page turn sound on after the viewer has pressed something on it; before
        // that, unmuting pauses the video. So after a restart the monitor stays silent until the first
        // press of the sound button, and from then on sound follows the channel automatically.
        const canSound = !navigator.userActivation || navigator.userActivation.hasBeenActive;
        if (!muted && !canSound) { muted = true; $("#sound").textContent = "Sound on"; if ($("#tvsound")) $("#tvsound").textContent = "Sound on"; hint("Press ▶❙❙ for sound"); }
        if (!muted) [800, 2500, 5000].forEach(ms => setTimeout(() => { command("unMute"); command("playVideo"); noCaptions(); }, ms));
        else { [800, 2500].forEach(ms => setTimeout(noCaptions, ms)); if (document.body.classList.contains("tv-on")) hint("Press the centre button for sound"); }
      });
      scr.prepend(f); sizeMain();
      $("#sound").hidden = false;
      $("#sound").textContent = muted ? "Sound on" : "Sound off";
    } else {
      const d = document.createElement("div");
      d.className = "ph-chan";
      d.innerHTML = `<div class="chan">${esc(c.name)}</div><div class="sub">${esc(c.note)}<br><a href="${esc(c.url)}" target="_blank" rel="noopener">Open ${esc(c.name)} ↗</a></div>`;
      scr.prepend(d); sizeMain();
      $("#sound").hidden = true;
    }
    renderTV(); renderTiles();
  }
  // The player picks its picture quality from the size it believes it is drawn at. On the TV stick the
  // whole page is laid out small (960 pixels wide) and scaled up by the stick, so the player took itself
  // for a small window and sent a small picture (480p on a 1080p screen: the blur). The main screen's
  // player is now laid out at full HD (1920x1080) and scaled down to fit its box, so it asks for the
  // 1080p stream; what it actually gets is shown by the badge beside the channel name.
  function sizeMain() {
    const scr = $("#screen"), f = scr && scr.querySelector("iframe");
    if (scr) scr.style.background = f ? "#000" : ""; // black bars, not the box's gradient, round a letterboxed picture
    if (!f) return;
    const w = scr.clientWidth, h = scr.clientHeight; if (!w || !h) return;
    // On computers the player is laid out at the wanted size (so it picks that quality itself) and scaled
    // to fit. Not on the TV stick: drawing a bigger frame there is what first sent the player to 144p.
    const lines = hdLines();
    // (YouTube's player largely ignores a requested quality, so the frame size is what counts; the
    // newer sticks can draw the full-size frame, so they get it too.)
    if (!lines || (document.body.classList.contains("fit") && OLD_STICK)) { f.style.cssText = ""; return; }
    const z = parseFloat(document.body.style.zoom) || 1; // Silk's whole-page zoom shrinks the frame too
    const W = (lines * 16 / 9) / z, H = lines / z, k = Math.min(w / W, h / H);
    f.style.cssText = `position:absolute;left:0;top:0;right:auto;bottom:auto;width:${W.toFixed(2)}px;height:${H.toFixed(2)}px;transform-origin:0 0;transform:translate(${((w - W * k) / 2).toFixed(2)}px,${((h - H * k) / 2).toFixed(2)}px) scale(${k.toFixed(5)})`;
  }
  const mainSizer = window.ResizeObserver ? new ResizeObserver(() => sizeMain()) : null;
  if (mainSizer) mainSizer.observe($("#screen"));
  listen(window, "resize", () => requestAnimationFrame(sizeMain));
  function command(func, args) {
    const f = $("#screen iframe");
    if (f) f.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: args || [] }), "*");
  }
  let lastToggle = 0;
  function toggleSound() {
    // One press can arrive as both a click and a key press (TV browsers): count it once.
    if (Date.now() - lastToggle < 450) return; lastToggle = Date.now();
    muted = !muted;
    store.set("rc-sound", !muted);
    command(muted ? "mute" : "unMute");
    command("playVideo");
    $("#sound").textContent = muted ? "Sound on" : "Sound off";
    if ($("#tvsound")) $("#tvsound").textContent = muted ? "Sound on" : "Sound off";
    hint(muted ? "Sound off" : "Sound on");
  }
  $("#sound").addEventListener("click", toggleSound);
  function renderTV() {
    $("#tvgrid").innerHTML = CH.map(c => `<article class="tv${c.id === main ? " sel" : ""}">
      <div class="thumb">${esc(c.name)}</div>
      <div class="body"><span class="avail ${c.youtube ? "ok" : "lim"}">${c.youtube ? (isDead(c.id) ? OFFAIR : "Plays in the monitor") : "Opens separately"}</span>
      <h3>${esc(c.name)}</h3><p>${esc(c.note)}</p>
      <div class="acts">${c.youtube && !isDead(c.id) ? `<button class="btn gold" data-main="${c.id}">${c.id === main ? "On main screen" : "Make main screen"}</button>` : ""}
      <a class="btn" href="${esc(c.url)}" target="_blank" rel="noopener">Open ↗</a></div></div></article>`).join("");
  }
  // Live channel tiles: the other playable channels. On computers and iPads they show the live
  // picture (silent); on phones and the Fire TV they are name tiles, to save data and memory.
  function tilesLive() {
    return !document.body.classList.contains("tv-on") && !isFireTV && matchMedia("(min-width: 681px)").matches;
  }
  let tileKey = "";
  function renderTiles() {
    const el = $("#tiles"); if (!el) return;
    // On the TV the row stays put (the first six channels, the one on screen marked), so the buttons
    // always mean the same thing. Elsewhere it shows the other channels, with live pictures.
    const fit = document.body.classList.contains("fit");
    const others = fit ? PLAYABLE.filter(c => !isDead(c.id)).slice(0, 6) : PLAYABLE.filter(c => c.id !== main && !isDead(c.id)).slice(0, 4);
    const live = tilesLive();
    const key = others.map(c => c.id).join() + live + (fit ? "|" + main : "");
    if (key === tileKey) return;
    tileKey = key;
    el.innerHTML = others.map(c => `<button class="tile${live ? " has-pic" : ""}${c.id === main ? " cur" : ""}" data-main="${c.id}" aria-label="Show ${esc(c.name)} on the main screen">${live ? `<iframe src="${ytSrc(c, "&controls=0")}" data-ch="${c.id}" title="${esc(c.name)} preview" tabindex="-1" allow="autoplay; encrypted-media" loading="lazy"></iframe>` : ""}<span class="lv"><i></i>${c.id === main ? "NOW" : "LIVE"}</span><span class="ex" aria-hidden="true">⤢</span><span class="nm">${esc(c.short || c.name)}</span></button>`).join("");
    // Always a full row: the tiles share the width between however many channels are streaming.
    el.style.gridTemplateColumns = others.length ? `repeat(${others.length},minmax(0,1fr))` : "";
    el.hidden = !others.length;
    el.querySelectorAll("iframe[data-ch]").forEach(f => f.addEventListener("load", () => watch(f)));
  }
  { const mq = matchMedia("(min-width: 681px)"); if (mq.addEventListener) listen(mq, "change", renderTiles); }
  listen(document, "click", e => {
    const b = e.target.closest("[data-main]"); if (!b) return;
    setMain(b.dataset.main);
    if (b.closest("#tvgrid")) show("overview");
  });

  // Self-update: once a minute the published version is checked; when it changes, the new page is
  // fetched and its styles, body and scripts are swapped into this one in place, without navigating,
  // so the browser's bar stays hidden and the sound stays on. If that fails for any reason the page
  // reloads through a fresh address instead (a browser that pins pages in its cache, like Silk, then
  // still fetches the new one). version.json is written at each publish.
  let verSeen = null, swapping = false;
  async function swapTo(v) {
    const html = await fetch(location.pathname + "?r=" + encodeURIComponent(v), { cache: "no-store", credentials: "same-origin" }).then(r => { if (!r.ok) throw new Error("page " + r.status); return r.text(); });
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = [...doc.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute("href"));
    const scripts = [...doc.body.querySelectorAll("script[src]")].map(s => s.getAttribute("src"));
    if (!scripts.length) throw new Error("no scripts");
    doc.body.querySelectorAll("script").forEach(s => s.remove());
    const add = (tag, attrs) => new Promise((res, rej) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = () => res(e); e.onerror = () => rej(new Error("load " + (attrs.href || attrs.src))); (tag === "link" ? document.head : document.body).appendChild(e); });
    // New stylesheets first, so the new body is never drawn unstyled.
    const have = new Set([...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute("href")));
    await Promise.all(links.filter(h => !have.has(h)).map(h => add("link", { rel: "stylesheet", href: h })));
    if (window.RC_APP && window.RC_APP.dispose) window.RC_APP.dispose();
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => { if (!links.includes(l.getAttribute("href"))) l.remove(); });
    document.body.innerHTML = doc.body.innerHTML;
    for (const src of scripts) await add("script", { src });
  }
  const verCheck = () => fetch("/version.json?" + Date.now(), { cache: "no-store", credentials: "same-origin" })
    .then(r => r.ok ? r.json() : null).then(j => {
      if (!j || !j.v || swapping) return;
      const vm = $("#ver"); if (vm) vm.textContent = "v" + String(VER || j.v).slice(-4) + ((navigator.userAgent.match(/\bAFT\w+/) || [""])[0] ? " · " + navigator.userAgent.match(/\bAFT\w+/)[0] + (OLD_STICK ? " old" : "") : "");
      if (verSeen === null) verSeen = j.v;
      if (j.v === (VER || verSeen)) return;
      swapping = true;
      swapTo(j.v).catch(() => location.replace(location.pathname + "?r=" + encodeURIComponent(j.v)));
    }).catch(() => {});
  verCheck(); setInterval(verCheck, 60000);
  // ---------- Fire TV mode + remote ----------
  const tvb = $("#tvmode");
  function setTV(on) {
    document.body.classList.toggle("tv-on", on);
    if (typeof fitScale === "function") fitScale();
    tvb.setAttribute("aria-pressed", String(on));
    store.set("rc-tvmode", on);
    if (on) show("overview");
    requestAnimationFrame(renderCrawl);
    renderTiles();
    if (!on) requestAnimationFrame(() => paginate());
    // Entering TV Mode: make sure the player is running with the sound as set.
    if (on) setTimeout(() => { command("playVideo"); command(muted ? "mute" : "unMute"); hint(muted ? "Press the centre button for sound" : "Sound on"); }, 600);
  }
  tvb.addEventListener("click", () => setTV(tvb.getAttribute("aria-pressed") !== "true"));
  $("#tvctl")?.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tv === "prev") step(-1); else if (b.dataset.tv === "next") step(1); else if (b.id === "tvsound") toggleSound();
  });
  // The press layer over the picture in TV Mode (for remotes that work as a pointer).
  $("#tvpad")?.addEventListener("click", e => {
    const z = [...e.currentTarget.children].indexOf(e.target.closest("span"));
    if (z === 0) step(-1); else if (z === 2) step(1); else toggleSound();
  });
  // The Fire TV opens on the same overview as the iPad, sized to fit the TV without scrolling.
  // TV Mode (one channel, full screen) is one press away.
  const qs = new URLSearchParams(location.search);
  if (qs.get("hd") !== null) store.set("rc-hd", qs.get("hd") === "auto" ? null : qs.get("hd"));
  if (qs.get("bands") !== null) store.set("rc-bands", qs.get("bands") === "auto" ? null : qs.get("bands"));
  document.body.classList.toggle("fit", isFireTV || qs.has("fit"));
  // Fire TV sticks report a small screen (960x540). The TV overview is laid out for 1600x900
  // and scaled down to fit, so it looks the same as on the iPad instead of squashing up.
  // Done with the viewport tag: the browser lays the page out 1600px wide and scales it to the
  // screen itself, which TV browsers handle properly (video included), unlike CSS scaling.
  const vp = document.querySelector('meta[name="viewport"]');
  const screenW = () => Math.max(320, (screen && screen.width) || innerWidth);
  function fitScale() {
    const on = document.body.classList.contains("fit");
    const want = on ? `width=1600,initial-scale=${(screenW() / 1600).toFixed(4)},minimum-scale=0.1,maximum-scale=5,user-scalable=no` : "width=device-width,initial-scale=1,viewport-fit=cover";
    if (vp && vp.getAttribute("content") !== want) vp.setAttribute("content", want);
    document.documentElement.classList.toggle("scaled", on);
    // Desktop-style TV browsers (Silk on the Fire TV) ignore the viewport tag, so the window stays
    // 960px wide: zoom the 1600x900 layout to whatever space the browser leaves, bar or no bar.
    const z = on && innerWidth < 1400 ? Math.min(innerWidth / 1600, innerHeight / 900) : 0;
    document.body.style.zoom = z ? z.toFixed(4) : "";
    document.documentElement.classList.toggle("zoomed", !!z);
    // The browser may keep some rows for its own bar (Silk does): lay the page out in what is left.
    document.documentElement.style.setProperty("--fit-h", on && !z && innerWidth >= 1400 ? Math.min(900, innerHeight) + "px" : "900px");
    sizePane();
    if (typeof radar !== "undefined" && radar) setTimeout(() => { radar.invalidateSize(); radar.setView(radarCentre(), 8.75, { animate: false }); }, 50);    requestAnimationFrame(sizeMain); // the picture's box has changed with the layout
  }
  listen(window, "resize", () => { fitScale(); requestAnimationFrame(() => paginate()); });
  // In Fire TV mode the right-hand pane takes whatever width a 16:9 picture leaves over, so on a
  // wide screen the picture stays full height and the pane grows. (Layout sizes, not drawn sizes:
  // the wide layout below is drawn squeezed.)
  function sizePane() {
    const el = document.documentElement;
    if (!document.body.classList.contains("tv-on") || !document.body.classList.contains("fit")) { el.style.removeProperty("--pane-w"); return; }
    const scr = $("#screen"), cols = document.querySelector(".cols");
    if (!scr || !cols) return;
    const w = Math.round(cols.clientWidth - 14 - scr.offsetHeight * 16 / 9);
    el.style.setProperty("--pane-w", Math.max(380, w) + "px");
  }
  // The office screen is an ultrawide (21:9) monitor. The stick can only put out a 16:9 picture, so
  // the monitor is set to stretch it a third wider (its Ratio setting, "Full Wide"); the page is
  // laid out at 2133x900 and drawn squeezed by a quarter, which the stretch cancels out, so
  // everything is the right shape and the whole screen is used. Switched by /wide.json (published)
  // or, on the stick, by opening the address with ?wide=1, ?wide=0 or ?wide=auto (follow wide.json).
  const wideQ = qs.get("wide");
  if (wideQ !== null) store.set("rc-wide", wideQ === "auto" ? null : wideQ !== "0");
  function applyWide(on) {
    document.documentElement.classList.toggle("wide", !!on && document.body.classList.contains("fit"));
    fitScale(); requestAnimationFrame(() => paginate());
  }
  if (store.get("rc-wide", null) !== null) applyWide(store.get("rc-wide", null));
  fetch("/wide.json?x=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(d => { if (store.get("rc-wide", null) === null) applyWide(!!d.wide); }).catch(() => {});
  // Ask the TV not to dim or show its screensaver while the monitor is open (where the browser allows it).
  let wake = null;
  async function keepAwake() {
    try { if ("wakeLock" in navigator && !wake && document.visibilityState === "visible") { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch {}
  }
  keepAwake();
  listen(document, "visibilitychange", keepAwake);
  setInterval(keepAwake, 60000);
  setTV(hash === "firetv" || qs.has("tv") || store.get("rc-tvmode", isFireTV));

  let hintTimer;
  function hint(text) {
    const h = $("#hint"); h.textContent = text; h.hidden = false;
    clearTimeout(hintTimer); hintTimer = setTimeout(() => { h.hidden = true; }, 2500);
  }
  function step(dir) {
    if (!PLAYABLE.length) return;
    let i = PLAYABLE.findIndex(c => c.id === main);
    i = (i + dir + PLAYABLE.length) % PLAYABLE.length;
    setMain(PLAYABLE[i].id);
    hint(PLAYABLE[i].name);
  }
  // Fire TV remote: ◀ ▶ or ⏪ ⏩ change channel; centre button or ▶❚❚ turns sound on/off.
  listen(document, "keydown", e => {
    if (!$("#gate").hidden) return;
    const k = e.key, c = e.keyCode;
    if (!document.body.classList.contains("tv-on")) { overviewKey(e); return; }
    // In TV Mode, ▲ or ▼ returns to the overview.
    if (k === "ArrowUp" || k === "ArrowDown") { setTV(false); focusFirst(); requestAnimationFrame(paginate); e.preventDefault(); return; }
    if (k === "ArrowRight" || k === "MediaFastForward" || k === "MediaTrackNext" || c === 228) { step(1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "MediaRewind" || k === "MediaTrackPrevious" || c === 227) { step(-1); e.preventDefault(); }
    else if (k === "Enter" || k === " " || k === "MediaPlayPause" || c === 179 || c === 85) { toggleSound(); e.preventDefault(); }
  });

  // ---------- Remote control on the overview ----------
  // The arrow keys move a bronze highlight to the nearest item in that direction (tabs, channel tiles,
  // buttons, headlines); the centre button selects it. ▶❚❚ turns the sound on or off.
  function focusables() {
    return [...document.querySelectorAll("nav button, #tvmode, .tile, #sound, #stage-link, .list a, .chips button, .tv .btn, #tiles button")]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });
  }
  function focusFirst() { const t = document.querySelector(".tile") || focusables()[0]; t && t.focus({ preventScroll: true }); }
  function overviewKey(e) {
    const k = e.key, c = e.keyCode;
    if (k === "MediaPlayPause" || c === 179 || c === 85) { toggleSound(); e.preventDefault(); return; }
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[k];
    if (!dir) return;
    const items = focusables(); if (!items.length) return;
    const cur = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { focusFirst(); e.preventDefault(); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const along = dx * dir[0] + dy * dir[1]; if (along <= 4) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus({ preventScroll: false }); best.scrollIntoView({ block: "nearest" }); }
    e.preventDefault();
  }
  if (document.body.classList.contains("fit") && !document.body.classList.contains("tv-on")) setTimeout(focusFirst, 600);
  // ---------- Page turn on the TV overview ----------
  // On the Fire TV each panel shows a page of headlines that fits, then fades to the next page every
  // 20 seconds; the panels are staggered so they never all change at once. Computers, iPads and
  // phones are unaffected (you scroll those yourself).
  const PAGE_MS = 20000;
  const pagers = new Map();
  function onTvOverview() { return document.body.classList.contains("fit") && !document.body.classList.contains("tv-on"); }
  function showPage(ul) {
    const p = pagers.get(ul); if (!p) return;
    p.pages.forEach((pg, i) => pg.forEach(li => { li.hidden = i !== p.page; }));
    const head = ul.closest(".panel")?.querySelector(".ph h2"); if (!head) return;
    let ind = head.querySelector(".pg");
    if (!ind) { ind = document.createElement("span"); ind.className = "pg"; head.appendChild(ind); }
    ind.textContent = p.pages.length > 1 ? `${p.page + 1}/${p.pages.length}` : "";
  }
  function paginate() {
    if (!onTvOverview()) return;
    document.querySelectorAll("#v-overview .list").forEach((ul, idx) => {
      if (ul.id === "wx-warn") return;
      const lis = [...ul.children];
      lis.forEach(li => { li.hidden = false; });
      const avail = ul.getBoundingClientRect().height;
      const pages = []; let cur = [], used = 0;
      lis.forEach(li => {
        const h = li.getBoundingClientRect().height;
        if (cur.length && used + h > avail + 1) { pages.push(cur); cur = []; used = 0; }
        cur.push(li); used += h;
      });
      if (cur.length) pages.push(cur);
      const prev = pagers.get(ul);
      pagers.set(ul, { pages, page: prev ? Math.max(0, Math.min(prev.page, pages.length - 1)) : 0, idx });
      showPage(ul);
    });
    if (typeof radar !== "undefined" && radar) radar.invalidateSize();
  }
  let pageTick = 0;
  setInterval(() => {
    if (!onTvOverview()) return;
    pageTick++;
    pagers.forEach((p, ul) => {
      if (!ul.isConnected || p.pages.length < 2 || (pageTick + p.idx) % 4 !== 0) return;
      if (ul.contains(document.activeElement)) return; // never move the headline the remote is on
      ul.classList.add("turning");
      setTimeout(() => { p.page = (p.page + 1) % p.pages.length; showPage(ul); ul.classList.remove("turning"); }, 450);
    });
  }, PAGE_MS / 4);
  listen(window, "resize", () => requestAnimationFrame(paginate));

  // ---------- PIN ----------
  function showGate() { $("#gate").hidden = false; setTimeout(() => $("#pin").focus(), 50); }
  $("#gate-form").addEventListener("submit", async e => {
    e.preventDefault();
    const go = $("#pin-go"); go.disabled = true; $("#gate-msg").textContent = "";
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: $("#pin").value }), credentials: "same-origin" });
      if (r.ok) { $("#gate").hidden = true; $("#pin").value = ""; start(); }
      else $("#gate-msg").textContent = "That PIN is not right. Try again.";
    } catch { $("#gate-msg").textContent = "Could not reach the monitor. Check the connection and try again."; }
    go.disabled = false;
  });

  // ---------- start ----------
  let timers = [];
  async function start() {
    timers.forEach(clearInterval); timers = [];
    try {
      if (!(await loadNews())) return;
    } catch {
      document.querySelectorAll(".list").forEach(l => { l.innerHTML = `<li class="empty">News could not be loaded. It will try again shortly.</li>`; });
    }
    loadMarkets(); loadPetitions(); loadCases(); loadWarnings(); initRadar();
    timers.push(setInterval(() => { loadPetitions(); loadCases(); }, 2 * 60 * 1000));
    timers.push(setInterval(loadWarnings, 10 * 60 * 1000));
    timers.push(setInterval(() => { if (radar) loadRadar(); }, 5 * 60 * 1000));
    timers.push(setInterval(() => loadNews().catch(() => {}), REFRESH_MS));
    timers.push(setInterval(loadMarkets, REFRESH_MS));
  }
  setMain(main);
  renderTV(); renderTiles();
  start();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

  // Handing over to a newer copy of the script (see verCheck): stop everything this copy left running.
  window.RC_APP = { v: VER, dispose() {
    _timers.forEach(id => window.clearInterval(id)); _subs.forEach(([t, ev, fn, o]) => t.removeEventListener(ev, fn, o));
    [loopTimer, feedTimer, hintTimer].forEach(id => clearTimeout(id)); cancelAnimationFrame(bandRaf); bands.clear();
    try { if (radar) radar.remove(); } catch {} radar = null;
    try { if (wake) wake.release(); } catch {} wake = null;
    try { if (mainSizer) mainSizer.disconnect(); } catch {}
    document.body.style.zoom = "";
  } };
})();
