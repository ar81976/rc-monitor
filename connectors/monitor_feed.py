"""
Send results to the Redfern Cavendish Monitor.

Drop this file into the Petition Watch (or Case Monitor) folder. At the end of each run, call:

    from monitor_feed import send_petitions, send_cases
    send_petitions(rows)   # Petition Watch
    send_cases(rows)       # Case Monitor

Each row is a dict. Petition Watch rows use:
    company, petitioner, hearing_date (YYYY-MM-DD), court, gazette_date or presented_date (YYYY-MM-DD),
    status ("new" for today's finds), url (optional)
Case Monitor rows use:
    title, case_no, court, issued_date (YYYY-MM-DD), unrepresented ("Claimant", "Defendant" or ""), url (optional)

Settings, in a file called monitor.json beside this one. One monitor:
    { "monitor_url": "https://monitor.redcav.com", "push_token": "<FEED_PUSH_TOKEN from Vercel>" }
or several (office and home), each with its own token:
    { "monitors": [ { "url": "https://monitor.redcav.com", "token": "..." },
                    { "url": "https://news.redcav.com",    "token": "..." } ] }
(or the environment variables RC_MONITOR_URL and RC_MONITOR_TOKEN for one).
A monitor that cannot be reached is reported and skipped; the others are still updated.

Uses only Python's standard library. A failure is reported and never stops the run.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

PETITION_KEYS = ("company", "petitioner", "hearing_date", "court", "gazette_date", "presented_date", "status", "url")
CASE_KEYS = ("title", "case_no", "court", "issued_date", "unrepresented", "url")


def _settings() -> list[tuple[str, str]]:
    """Every monitor to update: the office monitor, the Chamberlain home edition, or both."""
    targets: list[tuple[str, str]] = []
    url, token = os.environ.get("RC_MONITOR_URL"), os.environ.get("RC_MONITOR_TOKEN")
    if url and token:
        targets.append((url.rstrip("/"), token))
    cfg = Path(__file__).with_name("monitor.json")
    if cfg.exists():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
            if data.get("monitor_url") and data.get("push_token"):
                targets.append((data["monitor_url"].rstrip("/"), data["push_token"]))
            for m in data.get("monitors", []):
                if m.get("url") and m.get("token"):
                    targets.append((m["url"].rstrip("/"), m["token"]))
        except (OSError, ValueError) as e:
            print(f"[Monitor] could not read monitor.json: {e}")
    return targets


def _clean(rows, keys) -> list[dict]:
    out = []
    for r in rows or []:
        item = {k: ("" if r.get(k) is None else str(r.get(k)).strip()) for k in keys if k in r}
        if item:
            out.append(item)
    return out[:50]


def _send_one(url: str, token: str, name: str, body: bytes, count: int) -> bool:
    req = urllib.request.Request(
        f"{url}/api/feed?name={name}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}",
                 "User-Agent": "RedfernCavendish-Connector/1.1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"[Monitor] {url}: sent {count} {name} item(s), HTTP {r.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[Monitor] {url}: refused the update, HTTP {e.code} {e.read()[:200]!r}")
    except Exception as e:  # network down, wrong address, etc.
        print(f"[Monitor] {url}: could not be reached: {e}")
    return False


def _send(name: str, items: list[dict]) -> bool:
    targets = _settings()
    if not targets:
        print("[Monitor] not set up (no monitor.json), skipping.")
        return False
    body = json.dumps({"items": items}).encode("utf-8")
    results = [_send_one(u, t, name, body, len(items)) for u, t in targets]
    return any(results)


def send_petitions(rows) -> bool:
    """Newest first is best; the monitor shows the first 8."""
    return _send("petitions", _clean(rows, PETITION_KEYS))


def send_cases(rows) -> bool:
    """Put cases with an unrepresented party first; the monitor shows the first 8."""
    return _send("cases", _clean(rows, CASE_KEYS))


# ---- Petition Watch: rows from its store ------------------------------------------------------------
def _day(v) -> str:
    """'22 September 2026', '22/09/2026', '2026-09-22' or a date -> 'YYYY-MM-DD' ('' if unknown)."""
    import datetime as _dt, re as _re
    if not v:
        return ""
    if isinstance(v, (_dt.date, _dt.datetime)):
        return v.strftime("%Y-%m-%d")
    s = _re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", str(v).strip())
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return _dt.datetime.strptime(s[:30], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s[:10] if _re.match(r"\d{4}-\d{2}-\d{2}", s) else ""


def petition_rows(store, days: int = 0) -> list[dict]:
    """Today's new petitions found on CE-File (days=0), newest first, as they are found through the day;
    each is marked "new", so the monitor's band leads with it and its panel flags it. Petitions known
    only from Gazette advertisements are left out."""
    import datetime as _dt
    if store is None or not getattr(store, "petitions", None):
        return []
    today = _dt.date.today()
    cutoff = (today - _dt.timedelta(days=days)).isoformat()
    changed = getattr(store, "changed", {}) or {}
    rows = []
    for key, p in store.petitions.items():
        # Only petitions Petition Watch found on CE-File: the Gazette's advertisements (with their
        # hearing dates) are older petitions coming up for hearing, not new ones, and stay off the monitor.
        seen = _day(p.get("cefile_seen"))
        if not seen or seen < cutoff:
            continue
        court = (p.get("court") or "").strip()
        reg = (p.get("registry") or "").strip()
        if not court:
            court = "High Court, London" if reg in ("", "London") else f"{reg} District Registry"
        # CE-File sometimes lists a petition before the company is named (the case number and the
        # petitioner are known); it is shown as such rather than left off, and named at a later run.
        name = (p.get("ch_name") or p.get("company_name") or "").strip()
        if not name:
            name = f"Company not yet named · {p.get('case_number') or key}"
        rows.append({
            "company": name,
            "petitioner": p.get("petitioner") or "",
            "hearing_date": _day(p.get("hearing_date")),
            "court": court,
            "gazette_date": _day(p.get("published")),
            "presented_date": _day(p.get("presented_on")) or seen,
            "status": "new" if (changed.get(key) == "New" or seen == today.isoformat()) else "",
            "url": p.get("notice_url") or p.get("cefile_url") or "",
            "_seen": seen + " " + (str(p.get("found_time") or "00:00")),  # latest find first
        })
    rows.sort(key=lambda r: r["_seen"], reverse=True)
    rows.sort(key=lambda r: r["status"] != "new")
    for r in rows:
        r.pop("_seen", None)
    return rows[:50]


if __name__ == "__main__":
    # Quick test: python monitor_feed.py   -> sends one clearly-labelled test row to each panel.
    send_petitions([{"company": "TEST ROW - please ignore", "petitioner": "Connector test", "status": "new"}])
    send_cases([{"title": "TEST ROW - please ignore", "case_no": "TEST", "unrepresented": "Defendant"}])
