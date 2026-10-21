# Redfern Cavendish Monitor

UK business, politics and insolvency news, live TV and markets, in Redfern Cavendish house style.
One app, three layouts: desktop, phone and the office Fire TV stick. It installs with its own crest
icon on iPhone, iPad, Android, Windows and Mac, and opens full screen like any other app.

---

## 1. Put it online at monitor.redcav.com

The monitor runs on **Vercel** (the same account hosts Chamberlain News).

1. Create an account at vercel.com.
2. On a computer with Node.js installed (nodejs.org, the "LTS" version), open a terminal in this folder and run:
   ```
   npx vercel
   ```
   Sign in when asked and accept the suggested answers. This creates the project and a preview address.
3. In the Vercel dashboard, open the project, then **Settings → Environment Variables**, and add:

   | Name | Value |
   |---|---|
   | `APP_PIN` | Not used: the monitor opens without a PIN (see `api/_lib.js` to bring one back). |
   | `SESSION_SECRET` | Any long random phrase (keeps sign-ins secure). |
   | `EODHD_API_TOKEN` | Your market-data key (see section 2). Leave out until you have one. |

4. Publish the live version:
   ```
   npx vercel --prod
   ```
5. **Settings → Domains → Add** `monitor.redcav.com`. Vercel shows one DNS record to add, a **CNAME**
   pointing `monitor` to Vercel. Add that record wherever redcav.com is registered. The padlock
   (https) is set up automatically, usually within minutes.

The monitor opens without a PIN.

## 2. Market prices (ticker)

Prices come from **EODHD** (eodhd.com), delayed by about 15 minutes, which is what a public-facing
office screen should use. Until a key is added, the ticker says prices are not connected; it never
shows invented numbers.

- This monitor shares one EODHD key with Chamberlain News: the **EOD Historical Data: All World**
  plan ($19.99 a month or $199 a year, October 2026). Put the same key in `EODHD_API_TOKEN` in both
  Vercel projects. Together the two use roughly 25,000 of the plan's 100,000 daily calls.
- Gilt yields need EODHD's All-in-One plan ($99.99 a month), so the ticker shows the UK gilts tracker
  fund's move for the day instead. Gold and Brent are the latest daily closes (no live tick on this plan);
  the FTSE indices are tracker-fund moves, as EODHD carries no FTSE index data.
- Add the key as `EODHD_API_TOKEN` (section 1, step 3) and publish again (`npx vercel --prod`).
- Prices refresh every 5 minutes. London shares show in pence, as on the LSE.
- The indices, currencies (GBP/USD, GBP/EUR, EUR/USD), gold, Brent crude and the 2-, 10- and 30-year
  gilt yields appear on every loop of the ticker (gilts show the yield and its move in percentage points).
  The shares are in three groups (UK Shares, US Tech & AI, Luxury) which take turns, one group per
  loop, each introduced by a gold group marker.
- To change which shares appear, or their groups, edit `api/_markets.js`.

## 3. Install it as an app

**iPhone / iPad:** open `https://monitor.redcav.com` in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.
The crest icon appears on the home screen as "RC Monitor".

**Android:** open the address in **Chrome** → menu (⋮) → **Install app**.

**Windows / Mac:** open the address in **Chrome** or **Edge** → click the install icon at the right of
the address bar (a screen with a down arrow) → **Install**. It then appears in the Start menu or Dock.

Once installed it opens in its own window with no browser bars, and updates itself whenever the
monitor is changed. There is nothing to reinstall.

## 4. The office Fire TV stick

The monitor runs in the stick's own **Silk** browser. (Fully Kiosk Browser was tried and rejected:
its browser engine cannot draw live video inside the page on the Fire TV Stick 4K.)

1. **Set the stick to 1080p**: Settings → Display & Sounds → Display → Video Resolution → **1080p 60Hz**
   (at 4K the browser runs out of memory), and Dynamic Range Settings → **Adaptive**.
2. Open **Silk Browser**, select the address bar and go to `monitor.redcav.com` (until the domain is
   set up, `rc-monitor.vercel.app`). Ignore Silk's own Amazon sign-in page if it appears; it is not needed.
3. There is no PIN to enter.
4. Silk's bar at the top hides when you push the cursor to the **bottom edge** of the screen; it comes
   back whenever the cursor moves.

The page updates itself: each publish is picked up within a minute, with the build number (`v…`)
shown beside the TV Mode button.

**Sound:** browsers start video silently after a restart. Press the **centre button** on the Sound
button (or ▶❚❚) once; the sound then stays on, including when the channel changes.

**The remote in Silk** moves a pointer; the centre button clicks. On the overview, click a channel
tile to put it on the main screen, the Sound button for sound, and Fire TV mode for one channel
full screen. In TV Mode the header has ◀ channel ▶ and Sound buttons, and a press on the picture
itself toggles the sound.

**Streams:** Sky News and GB News schedule each programme as its own YouTube stream. The monitor
looks up the channel's rolling news stream (the one with the most viewers) and moves to the new
stream when a programme ends. BBC News does not allow its stream to play inside other sites, so its
button opens iPlayer.

### News panels on the TV

On the TV's overview, each news panel shows a page of headlines that fits, then fades to its next
page every 20 seconds (a small "1/3" beside the panel title shows which page). The panels are
staggered so they never all change at once, and a panel never turns while the remote's highlight
is on one of its headlines. Computers, iPads and phones don't page; you scroll those yourself.

### Rain radar

The right-hand column has a live rain radar centred on the office (CWG House, Market Rasen) (Lincoln, the Wolds, Grimsby, the
Humber and the coast in frame), looping the last hour and refreshing every 10 minutes. The radar
pictures come free from RainViewer and the map from Esri; neither needs a key. On the TV the radar
sits under Insolvency & Courts; the Petition Watch and Case Monitor panels appear there once they are
connected (section 5). In Fire TV mode the radar is a pane to the right of the picture: a 16:9
picture in the space under the header never filled the width anyway, so the pane takes the margin and
the picture is the same size. Under the radar are the Met Office's current weather warnings for the
East Midlands region (set `WARNINGS_REGION` in Vercel to change the region, e.g. `yh` for Yorkshire &
Humber).

### The wide (21:9) office monitor

The office screen is an ultrawide monitor and the stick can only put out a 16:9 picture, which the
monitor shows with black bars at the sides. So the monitor is set to stretch the picture to fill the
screen (its own menu: Picture → Ratio → **Full Wide**) and the monitor page is laid out a third wider
and drawn a quarter narrower, which the stretch cancels out: everything is the right shape and the
whole screen is used, with the picture full height and a wide radar beside it.

This is switched by `public/wide.json` (`{ "wide": true }`), which takes effect at the next publish; on
the stick itself, opening `rc-monitor.vercel.app/?wide=0` turns it off, `?wide=1` on and `?wide=auto`
goes back to following wide.json. If the monitor is ever swapped for a normal 16:9 screen, set the
monitor's ratio back to Original and wide.json to false.

### Remote control

In Silk the ring moves a pointer and the centre button clicks. ▶❚❚ also toggles sound. Home goes to
the Fire TV home screen (Prime Video, iPlayer); open Silk again to come back.

### Prime Video and BBC iPlayer

These play in their own Fire TV apps, with sound through the TV as normal. Press **Home**, open Prime
Video or iPlayer, and when finished open Fully Kiosk (or Silk) again to return to the monitor. BBC News
plays inside the monitor from its YouTube stream; BBC Parliament is iPlayer-only, so its button on the
TV tab opens iPlayer instead.

## 5. Petition Watch and Case Monitor panels

Petition Watch runs on your Windows PC, so it **sends** its results to the monitor at the end of
each morning and evening run. The monitor keeps the latest set and shows it. Nothing flows the
other way: the monitor cannot see or change anything in Petition Watch.

**One-off setup on the monitor (Vercel):**

1. Project → **Storage** → add **Upstash for Redis** (free plan). This adds `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically.
2. Settings → Environment Variables → add `FEED_PUSH_TOKEN`: a long random code (at least 16
   characters). Petition Watch uses it to prove the update is genuine.
3. Publish again: `npx vercel --prod`.

**On the PC:** `connectors/monitor_feed.py` goes into the Petition Watch folder (and, later, the
Case Monitor folder), with a file `monitor.json` beside it:
```
{ "monitor_url": "https://monitor.redcav.com", "push_token": "<the FEED_PUSH_TOKEN>" }
```
Running `python monitor_feed.py` once sends a "TEST ROW - please ignore" to each panel, to check the
connection. Each tool then calls `send_petitions(...)` or `send_cases(...)` at the end of its run.

| Panel | What each row carries |
|---|---|
| Petition Watch | `company`, `petitioner`, `hearing_date`, `court`, `gazette_date` or `presented_date`, `status` (`"new"` for today's finds), `url` |
| Case Monitor | `title`, `case_no`, `court`, `issued_date`, `unrepresented` (`"Claimant"`, `"Defendant"` or blank), `url` |

A gold **New** flag shows on petitions found today, and a gold flag names any unrepresented party.
Each panel shows when it was last updated. Until a tool has sent anything, its panel says
"Not connected yet". These panels show on computers, iPads and phones, not on the office TV in
Fire TV mode. (A tool that publishes its own feed address can be used instead: set
`PETITION_WATCH_FEED_URL` / `CASE_MONITOR_FEED_URL`.)

**On the UK News band** (Fire TV mode and the TV tab), today's petitions lead the band with a pulsing
red **New petition** flag, the company, the petitioner and the court; today's High Court filings from
Case Monitor follow with a gold **High Court** flag. Each one stays on the band for an hour from when
it first appears (and for at least three passes), then drops out for good. The band is about five
minutes long, so an alert comes round roughly every five minutes while it is on. When it first appeared
and how many passes it has made are kept on the device, so a publish, an update or a restart does not
reset the clock. The hour is `STAY_MS` in `public/app.js`. Petition Watch sends
today's petitions after every run, including the half-hourly checks, so a petition found at 12:30 is on
the band by 12:33. A petition CE-File lists before the company is named shows as "Company not yet
named · CR-2026-…" with the petitioner, and is named at a later run.

Glanvill is deliberately not connected, to keep client-confidential matters off the monitor.

## 6. Changing what it shows

| To change | Edit |
|---|---|
| News feeds | `api/_feeds.js` (each feed: source name, section, address) |
| TV channels | `public/channels.js` (YouTube channel ID for channels that play inside the monitor) |
| Ticker shares | `api/_markets.js` |

Then publish again by double-clicking `publish.cmd` (it stamps a new version number and deploys).

**About the TV channels:** GB News (the main screen), BBC News, Sky News, LBC, Bloomberg, Euronews,
Al Jazeera English, France 24, DW News, CNA and TRT World play from their official free YouTube live
streams, British channels first. A channel that isn't streaming, or doesn't allow its stream to play
inside other sites, is skipped automatically: the main screen moves to the next channel, the tiles
fill from further down the list, and the channel is tried again every 30 minutes. If a broadcaster
changes its YouTube channel, update its ID in `public/channels.js`.

**About the news:** the monitor shows headlines with a link to the publisher's own page, never the
article text. Sport is left out of every feed (by the feed's own section labels; City AM's business
feed carries its sport desk too), and a feed can name other sections to leave out with `skip` in
`api/_feeds.js`.

**Insolvency headlines on the band:** any news headline about a business failing or insolvencies
rising runs on the UK News band straight after the Petition Watch alerts, with a gold **Insolvency**
tag: into or out of administration, administrators called in, liquidation, receivership,
winding-up and wound up (by a court), insolvent / insolvency / insolvencies (so the monthly statistics
count), bankruptcy, Chapter 11, CVAs and IVAs, "goes bust", creditors, a business collapsing, and the
Begbies Traynor red-flag reports. A government's "administration" is screened out. The newest six from
the last two days are shown; the test is the `INSOL_*` patterns near the top of `public/app.js`. The
gov.uk feeds (Insolvency Service and HM Courts & Tribunals) stay off the band altogether: they are for
the Insolvency & Courts panel.

## 7. Trying it on a computer first

```
npm run dev
```
then open http://localhost:3000 (add `?tv` for the Fire TV layout). Set `APP_PIN` and
`EODHD_API_TOKEN` in the terminal first to try the PIN screen and prices.
