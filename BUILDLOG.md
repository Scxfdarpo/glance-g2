# Glance — Even Realities "Heads Up" Hackathon build log

App: **Glance** — Polymarket live odds + Telegram crypto-channel digest in one
glance on the G2 glasses. Track 02 (Crypto & DeFi) primary, Track 01
(Messaging & News) secondary. Deadline 2026-11-30 03:59 CST.

## Day 1 — 2026-11-26: toolchain, hello-world proof, data sources, skeleton

### Toolchain (installed and verified)

| Tool | Version | How |
| --- | --- | --- |
| Node.js / npm | v24.22.1 / 10.9.4 | preinstalled |
| `@evenrealities/evenhub-cli` | **0.2.0** (global) | `npm install -g @evenrealities/evenhub-cli`; `evenhub --version` → 0.2.0 |
| `@evenrealities/evenhub-simulator` | **0.9.5** (global) | `npm install -g @evenrealities/evenhub-simulator` (exact name confirmed from npm search; the brief's guess was right) |
| `@evenrealities/even_hub_sdk` | 0.0.10 (project-local, template pin) | comes with the template; latest on npm is 0.0.16 — upgrade candidate for Day 2 |
| Project-local CLI / simulator | 0.1.14 / 0.7.3 | template devDependencies, in `app/node_modules` |

**VM caveat (important):** system state outside `~` does not survive a runtime
restart on this VM. Mid-session a restart wiped the global npm installs and the
apt packages; the project-local `node_modules` (in `~/workspace`) survived.
Consequences:
- The simulator needs WebKitGTK: `apt-get install -y libwebkit2gtk-4.1-0`
  (provides libwebkit2gtk-4.1, libsoup-3.0, libjavascriptcoregtk-4.1).
  Re-run this after any VM restart before launching the simulator.
- Prefer the project-local simulator binary for reproducibility:
  `node app/node_modules/@evenrealities/evenhub-simulator/bin/index.js <url> --automation-port 9898`
  under `xvfb-run -a` (Xvfb is installed).

### Template

Official Route B from the docs ("Your First App",
https://hub.evenrealities.com/docs/get-started/quickstart/first-app):

```
npx degit even-realities/evenhub-templates/minimal app/
```
Repo: https://github.com/even-realities/evenhub-templates (folder `minimal`).
Vite + TypeScript + SDK + one full-canvas text container ("Hello from G2!").

### Hello-world proof (pristine template, before any edits)

- `npm install` in `app/` (73 packages), `npm run dev` → Vite on :5173 (HTTP 200).
- Simulator launched headless (Xvfb) against http://localhost:5173 with
  `--automation-port 9898`. Automation API: `/api/ping` → `pong`.
- WebView console: `[EvenAppBridge] Bridge initialized`, **`Page created: success`**.
- `GET /api/screenshot/glasses` → 576×288 PNG. The raw framebuffer encodes ink
  in the alpha channel on transparent black; composited as green-on-black it
  reads "Hello from G2! / Tap to count · double-tap to exit."
  → `app/docs/day1-simulator.png` (raw: `day1-simulator-raw.png`).
- Input verified: `POST /api/input {"action":"click"}` → display updated to
  "Taps: 1" (723 framebuffer pixels changed) → `app/docs/day1-simulator-after-tap.png`.
- Packaging verified: `npm run build` (tsc + vite) OK; `evenhub pack app.json dist`
  → valid `.ehpk` (30,387 bytes with the template manifest; 31,578 bytes with
  the Glance manifest). Pack stamps `min_app_version` up to the current SDK
  floor (2.2.10) automatically.

### Two traps found (cost real debugging time — remember them)

1. **`createStartUpPageContainer` returns 1 ("invalid params") on HMR reload.**
   It only succeeds on a cold start, when no startup page exists yet in the
   simulator session. After editing `main.ts`, restart the simulator — do not
   chase phantom parameter bugs. (On hardware the app always cold-starts.)
2. **List item names are capped at 63 BYTES (UTF-8), not characters.** A list
   containing emoji-heavy rows (🚨 = 4 bytes) silently makes the whole startup
   page invalid → same result code 1. `clampItem()` in `src/feeds.ts` clamps
   by encoded byte length (≤60 bytes).

### Data sources — verified live from this VM (2026-11-26 ~12:45 CST)

**Polymarket Gamma API — ✅ works, no key.**
- `GET https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume24hr` → HTTP 200.
  Top event at check time: "Packers vs. Rams", 305 markets, $11,228,881 24h volume.
- `GET /markets?active=true&limit=2` → HTTP 200; sample: "Xi Jinping out before
  2027?" outcomes [Yes, No], outcomePrices [0.0165, 0.9835], liquidity $292,847.
- Odds, outcomes, volume, liquidity all present as JSON strings/arrays — trivially parseable.

**Telegram public previews (`https://t.me/s/<channel>`) — ✅ works, no account/key, with a channel caveat.**
- `whale_alert_io` → HTTP 200, 20 messages; parsed sample: "🚨 2,609 $BTC
  (155,908,749 USD) transferred from Coinbase Institutional to unknown wallet".
- `cointelegraph` → HTTP 200, 15 messages; parsed sample: "🔥 LATEST: Bitcoin
  has fallen below the lowest band of the Bitcoin Rainbow Chart…".
- `CoinDeskNews`, `theblockcrypto` → 302 to the profile page, **0 messages**:
  these channels have no public preview and cannot be digested this way.
  Channel choice matters; verified-good list lives in `src/config.ts`.

### App skeleton (in `app/`)

Manifest `app.json`: package `com.makefun.glance`, name "Glance",
`network` permission whitelisting `https://gamma-api.polymarket.com`,
`https://t.me`, `http://localhost:8787` (dev proxy origin), plus a
`g2-microphone` permission for Day-2 voice.

Layout (576×288, three containers): header text (status line) · feed list
(markets, then Telegram posts; selection border; scroll + tap) · detail text
(selected row expanded). Event routing follows the template's envelope rules
(CLICK=0 omitted-field default resolved inside the check; double-tap exit
checked first, mode 1 = system dialog).

Data path is real, not mocked: `src/feeds.ts` fetches the proxy at startup
(4 s timeout, placeholder rows on failure so the page always renders);
`server/proxy.mjs` is a zero-dependency Node proxy with
`GET /api/markets`, `GET /api/digest?channel=`, `GET /health` — verified
end-to-end with curl and in the simulator.

**Skeleton proof:** cold-started simulator with the proxy up → console
`Glance page created: success`; framebuffer shows "GLANCE · LIVE" header,
live market rows, detail pane "…Yes 100% · 24h vol $11,246,424"
(`app/docs/day1-skeleton.png`). Automation `down` + `click` moved the
selection to row 2 and updated the detail pane (`day1-skeleton-selected.png`).

### File tree (excluding node_modules/ and dist/)

```
even-realities/
├── BUILDLOG.md
└── app/
    ├── README.md                  (template readme — replace on Day 3)
    ├── app.json                   Glance manifest (network whitelist + mic)
    ├── index.html                 WebView host (template, retitled)
    ├── package.json               glance-g2; scripts: dev/build/pack/simulate/proxy
    ├── package-lock.json
    ├── tsconfig.json / vite.config.ts   (template, unchanged)
    ├── docs/
    │   ├── day1-simulator.png         hello-world frame (composited)
    │   ├── day1-simulator-raw.png     hello-world frame (raw framebuffer)
    │   ├── day1-simulator-after-tap.png
    │   ├── day1-skeleton.png          skeleton with live data
    │   └── day1-skeleton-selected.png skeleton after down+click
    ├── server/
    │   └── proxy.mjs              zero-dep backend proxy (Polymarket + Telegram)
    └── src/
        ├── config.ts              proxy URL, digest channels, row counts
        ├── feeds.ts               typed feed fetchers + glance formatting
        └── main.ts                3-container skeleton, event routing
```

### Day-2 next steps

1. **Crypto-first market selection.** Today the top-volume event is an NFL
   game, so the list fills with its sub-markets (spreads, quarters). Query
   Polymarket by the crypto tag and prefer each event's headline market, so
   the glance list is BTC/ETH/Fed-grade questions, not ball games.
2. **SDK upgrade check:** template pins SDK 0.0.10; npm latest is 0.0.16.
   Try the bump early on Day 2; keep 0.0.10 if anything regresses.
3. **Detail pages + read-and-write:** tap a market → detail page with big
   price + "watch this" action; voice (ASR template pattern) — "top market"
   / "latest whale" intents; draft-reply flow for Telegram items.
4. **Refresh loop:** periodic feed refresh without a page rebuild
   (text/list upgrades), plus a stale-data indicator in the header.
5. **Deploy the proxy** to a public origin and add that origin to the
   `app.json` whitelist (keep localhost for dev).
6. Digest: add the second channel (cointelegraph) as its own list section;
   strip the trailing "Details" link text from whale_alert posts.

## Day 2 — 2026-11-26: full app — both feeds, detail pages, watchlist, briefs

### Markets feed (Track 02) — crypto headline selection, live

- Proxy now queries `GET /events?...&tag_slug=crypto&order=volume24hr` —
  tag filtering works on **events** (verified live). Quirk: `tag_slug` on
  **/markets** is silently ignored (returns the global top-volume list —
  NVIDIA CEOs and boxing), so events are the only honest route.
- Headline market per event = its **most-traded active market** (max
  market-level `volume24hr`, liquidity breaks ties). `markets[0]` is NOT
  the headline for grouped strike events — it is an arbitrary tail strike
  ($100k-up with $535 of volume). One market per event → no sub-market
  floods. Top 10 events by event 24h volume.
- Rows are price-first (`Yes 13% · Will Bitcoin dip to $55,000 in
  November?`) so the 60-byte clamp can never eat the number. Detail adds
  NO price, `oneDayPriceChange` as "1d move: ▼17.0 pts today", 24h volume,
  liquidity, and the parent event title.

### Digest feed (Track 01) — merged, timestamped, deduped

- Proxy fetches both verified channels (`whale_alert_io`, `cointelegraph`),
  parses each message block by its `data-post` anchor so id + `<time
  datetime>` + text stay attached, dedupes by post id, merges newest-first.
- Cleanup in the proxy: trailing "Details" label (whale_alert), CoinTelegraph's
  trailing link-label footer ("News | Markets | YouTube"), flag emoji
  (regional indicators are not in the G2 font), siren-run collapse.
- Rows carry age + source (`1h @cointelegraph: …`); detail shows the full
  message text (the text container scrolls).

### ⚠️ Trap #3 — the dedupe regex that eats prose

The first siren-collapse regex, `/(\S+)( \1)+/g`, **corrupts ordinary
text**: backtracking lets group 1 shrink to a single character, so
"has successfully" → "hasuccessfully", "wallet to" → "walleto",
"the theater" → "theater". It only shows on real sentences, not on the
emoji runs it was written for. Shipped version requires a ≥2-char token
and a boundary after the run: `/(\S{2,})((?: \1)+)(?=\s|$)/g`. Verified
against live posts afterwards — all text clean.

### Views & navigation (rebuildPageContainer state machine)

- **LIST** — header (`GLANCE · MARKETS/DIGEST · updated HH:MM`, `· STALE`
  when a refresh fails) + feed list + footer hint. Row 0 is the feed
  switch (`>> DIGEST — tap to switch feed`); tapping a row opens DETAIL.
  Double-tap exits via the system dialog (root-page rule).
- **DETAIL** — full item text + action list. Markets: watch toggle,
  brief, back. Posts: brief, back.
- **BRIEF** — the item as one shareable line + back actions. Double-tap
  on any sub-page goes back to the list.
- Auto-refresh every 60 s: refetch both feeds; rebuild only when a data
  signature changes, otherwise upgrade just the header clock (verified:
  header advanced 05:08 → 05:09 untouched, watchlist intact).
- Offline behaviour verified end-to-end: cold start with the proxy down
  renders `STALE` + "No markets — tap to retry" + explanatory footer
  (never a blank screen); starting the proxy and tapping the retry row
  recovers live data in place.

### Read-and-write

- **Watchlist**: one tap on a market detail toggles watching; the action
  flips to "★ Watching — tap to unwatch", watched markets pin to the top
  of the list with a ★, the footer counts them ("1 watching"), and the
  set persists in localStorage — **verified across a simulator cold
  restart** (the ★ and the count survived).
- **Brief**: one tap composes a one-line summary on-device from the live
  numbers (question — Yes% — day move — 24h volume; for posts: source,
  age, first sentence). No LLM round-trip: the "AI drafts" story is
  "the draft is already written when you look". Market and digest briefs
  both screenshotted.

### Voice — probed, verdict: NOT possible in the simulator (do not fake)

A throwaway probe page (deleted after the run) called the SDK's mic API
on a cold-started simulator:

- `bridge.audioControl(true)` → **false** (mic open refused),
  `audioControl(false)` → false.
- **0 `audioEvent` frames, 0 PCM bytes in 5 s** (screenshot:
  `docs/day2-voice-probe.png`).
- The automation API has no audio-injection endpoint (`/api/audio` is
  empty), so there is no way to feed it speech either.
- SDK scope note: even on hardware, the SDK delivers **raw PCM only —
  there is no speech-to-text in the SDK**. Voice commands would need an
  ASR service behind the proxy; that is a hardware-era extension, not
  something this build claims. The app ships tap-only and says so.

### Glyph coverage (LVGL font) — learned from renderer warnings

- Missing: ⇄ (U+21C4) → replaced with ASCII `>>`; ✎ (U+270E) → dropped
  from action labels; regional-indicator flags (U+1F1F8/U+1F1FA) →
  stripped in the proxy.
- Render fine: ★ ☆ ← ▲ ▼ · — and the em dash.

### Verification screenshots (`app/docs/`)

| File | Shows |
| --- | --- |
| `day2-markets-list.png` | Markets list, live crypto headlines, price-first rows |
| `day2-market-detail.png` | Market detail: YES/NO, 1d move, vol, liquidity, event |
| `day2-digest-list.png` | Digest list: age + source per row, both channels merged |
| `day2-digest-detail.png` | Full post text, source + age, actions |
| `day2-brief.png` | Market one-line brief |
| `day2-brief-digest.png` | Post one-line brief |
| `day2-watchlist.png` | ★ pinned row + "1 watching" footer |
| `day2-offline.png` | Proxy-down cold start: STALE state, retry row, no blank screen |
| `day2-voice-probe.png` | Voice probe result on the glasses (audioControl false, 0 frames) |

`npm run build` (tsc + vite) clean; `npm run pack` → `out.ehpk` 33,339
bytes. Console over the whole session: no app errors (only the deliberate
offline-test fetch failures).

### What genuinely works vs hardware-only

- **Works here, end-to-end, real data**: both feeds, navigation,
  watchlist + persistence, briefs, 60 s refresh, offline/retry states.
- **Hardware-only / not claimed**: microphone capture and any voice
  interaction (simulator refuses the mic; SDK has no ASR); R1 ring and
  temple-touch nuances beyond click/scroll/double-click; on-glasses
  legibility in daylight.

### Day-3 remaining

1. Deploy the proxy to a public origin; add it to the `app.json`
   whitelist (keep localhost for dev); point `PROXY_BASE_URL` at it.
2. README rewrite (template readme still in `app/README.md`), GitHub
   repo, demo video (simulator footage is explicitly allowed), submit.
3. Optional: SDK 0.0.10 → 0.0.16 bump test (still untested; only with a
   full re-verification pass), extra digest channels if a third public
   preview verifies, brief for a watched-market digest ("your watchlist
   moved" summary line).

## Day 3 — 2026-11-26: finishing pass — data path, repo, demo video

(Finished early on purpose; the submission itself is handled separately.)

### Judge-runnable data path

- **Proxy stays the primary path**, one command: `npm run proxy`
  (zero-dependency, `server/proxy.mjs`, port 8787). `PROXY_BASE_URL` is
  now build-time configurable via `VITE_PROXY_BASE_URL`
  (`src/config.ts`); the localhost default is unchanged.
- **Direct-fetch fallback — implemented and VERIFIED in the simulator.**
  `fetchMarkets` in `src/feeds.ts` now falls back, when the proxy is
  unreachable, to fetching the Polymarket Gamma API directly from the app
  and applying the same crypto-tag + headline-market selection on-device.
  Test: dev server built with `VITE_PROXY_BASE_URL=http://127.0.0.1:9999`
  (dead port), cold-started simulator → console shows the two proxy
  fetches failing, then the markets list renders **live Gamma data**
  (header `updated`, no STALE). So Gamma's CORS does let the WebView
  through. Screenshot: `app/docs/day3-direct-fallback.png`. The digest
  still requires the proxy (it parses Telegram HTML) and degrades to the
  offline/retry state without it — as designed, no faked data.
- **Cloudflare quick tunnel — FAILED from this VM (environment, not the
  app).** `cloudflared` 2026.11.2 was downloaded to `~/workspace/bin/`.
  Evidence chain: (1) direct TLS from the VM is intercepted by the egress
  gateway ("tls: first record does not look like a TLS handshake" —
  plain-HTTP answer to a ClientHello, also seen with `curl --noproxy`);
  (2) `cloudflared` ignores the egress HTTP proxy, so a local SNI
  forwarder was built to carry its TLS through an HTTP CONNECT — CONNECT
  and TLS then succeed (a `curl` GET through the same path returns
  Cloudflare's real 403 with a verified certificate); (3) but the
  registration call itself, `POST https://api.trycloudflare.com/tunnel`,
  **never receives a response** — reproduced identically with plain
  `curl` through the normal egress proxy (40 s, zero bytes) while GETs
  through the same path answer in <0.5 s. Three `cloudflared` attempts
  all died on that POST. Verdict: quick tunnels are blocked by this VM's
  egress for POSTs to that host; the shipped, verified path is the local
  proxy (plus the direct-Gamma fallback above). On an unrestricted
  network the tunnel is a one-liner — documented in the README.

### GitHub repo

- Planned public repo: **https://github.com/Scxfdarpo/glance-g2** — the
  whole project (`app/` + root `README.md` + this log + `demo/`),
  `.gitignore` excludes `node_modules/`, `dist/`, `*.ehpk` and local
  runtime files. Local git repo is initialized with all 31 files staged;
  the commit + `gh repo create` + push step is **pending a security-check
  clearance** (flagged for user confirmation on 2026-11-26) — the repo
  URL above is the intended address, not yet live at the time of writing.
- The root README carries: the two tracks, Day-2 screenshots, the
  three-command quick start, the architecture diagram and the *why* of
  the proxy, the data-path/fallback story with the tunnel verdict, data
  sources + safety (read-only, no keys, no funds), the honest voice note,
  the pre-Nov-23 declaration (official minimal template + public APIs),
  and the feature list mapped to the rubric.

### Demo video

- `demo/glance-demo.mp4` — **39.0 s, 1152×648, H.264, 686 KB** (also
  copied to `~/workspace/your_files/Glance-demo.mp4`). Recorded from the
  REAL app in the simulator: the automation API drove the actual tap
  flow while the glasses framebuffer was captured at 8 fps, upscaled ×2
  (nearest-neighbour) with a burned-in caption band per beat.
- Beats, each verified frame-by-frame before assembly: markets list →
  market detail → watch toggle (★ Watching) → one-line brief → digest
  list → post detail → back to markets with the watched market pinned
  (★, "1 watching").
- Not uploaded anywhere; submission is a separate step.

## Day 4 — 2026-11-26: dominant-upgrade pass + publication

(Second pass the same day, at the user's "碾压式" standard: upgrade once
more, then submit. The git block from Day 3 was cleared by the user's
explicit go-ahead in chat.)

### 1. Home glance screen (new root view)

- The app now starts on HOME: BTC/ETH spot row, a conditional watch-alert
  row, the top watched (or top) market, the latest headline, then doors
  into MARKETS, DIGEST and the MORNING BRIEF. Rows are built as
  descriptors (`homeRows()` returns label + action together) so rendering
  and click handling can never disagree about a row's meaning.
- Double-tap semantics moved with the root: HOME double-tap = exit dialog;
  LIST double-tap = home; DETAIL double-tap = back to wherever it was
  opened from (`detailFrom`); the detail back-action label follows suit.
- Spot source bake-off (from this VM): **CoinGecko simple/price ✅**
  (price + 24h change, one call, no key) — primary, via the proxy's
  `/api/spot` and as the app's direct fallback. **Binance public ticker:
  geo-blocked** ("Service unavailable from a restricted location").
  **Kraken public Ticker ✅** — wired as the proxy-side fallback
  (open-vs-last gives the 24h change).

### 2. Market detail: 24h price trend (CLOB history)

- Gamma market objects carry `clobTokenIds`; the proxy now passes
  `yesTokenId` through, and `/api/history?token=` serves the CLOB
  `prices-history` (interval=1d, fidelity=60 → ~24 hourly points). The app
  fetches it when a market detail opens (proxy first, CLOB direct as
  fallback — both origins whitelisted in `app.json`) and re-renders.
- **Sparkline verdict: block glyphs U+2581–U+2588 are NOT in the G2 font.**
  A 16-wide block sparkline was appended to the trend line and the
  framebuffer analysed: zero ink in the sparkline's band — silently
  dropped, same failure mode as ⇄/✎. The sparkline was cut; the shipped
  rendering is the textual strip, reformatted to a single line after the
  spaced version wrapped (`24h: 30→35→44→22→16→13`).

### 3. Watch alerts

- Watched markets' last-seen Yes prices persist in localStorage
  (`glance:watch-prices:v1`); watching a market sets the baseline to the
  price on screen. On every refresh, a watched move of **≥3 pts** flags
  the list row (`▲+5.0`), adds `Watch alert: ▲ +5.0 pts since last check`
  to the detail, and raises an alert row on HOME. Unwatching clears the
  baseline and the alert. The marker is `!` + ▲/▼ (verified glyphs);
  ⚠ was not needed.
- **Verification method (honest test double):** real prices cannot be
  ordered to move 5 pts on cue, so the alert path was exercised with a
  local passthrough proxy on :8787 in front of the real proxy (moved to
  :8788) that rewrote exactly one watched market's Yes price 0.1295 →
  0.1795. The app's own refresh, comparison and rendering code ran
  untouched: within one 60 s cycle HOME showed
  `! ▲+5.0 pts · Will Bitcoin dip to $55,000 in November?`, the row
  showed `Yes 18% ▲+5.0`, and the detail carried the alert line
  (`docs/day4-alert.png`, `docs/day4-alert-detail.png`). The double was
  then removed, the real proxy restored, and the app was observed
  settling back to the real 13% with the alert cleared.

### 4. Morning brief

- New MORNING view, one tap from HOME: BTC/ETH line, top-3 markets with
  Yes %, top-2 headlines via the existing post-brief composer, signed
  "composed by Glance from live data". The one-line briefs stay.

### 5. Digest channels: 2 → 5

| Channel | t.me/s preview | Text blocks | Verdict |
| --- | --- | --- | --- |
| WatcherGuru | 14 posts | 21 | ✅ added |
| unfolded | 20 posts | 20 | ✅ added |
| cryptoquant_official | 12 posts | 13 | ✅ added |
| WuBlockchain | 0 (profile redirect) | — | ❌ no public preview |
| CryptoQuant (bare name) | 0 | — | ❌ (the _official handle is the real one) |

Merged top-10 in-app shows WatcherGuru items alongside the original two
(`docs/day4-digest.png`).

### 6. Proxy cache — the boot-time headline that wasn't

First HOME screenshot had no headline row: the five-channel digest made
the proxy's cold response slower than the app's 6 s fetch timeout, so
posts arrived empty at boot (markets/spot were fine). Fixes: the proxy
now serves every endpoint through a **stale-while-revalidate cache**
(20–120 s TTLs by endpoint) with **startup pre-warming**, and the app's
digest timeout rose to 15 s. HOME now renders complete on first paint.

### 7. SDK 0.0.10 → 0.0.16 — tested in scratch, adopted

- Scratch copy of the app with `@evenrealities/even_hub_sdk@^0.0.16`:
  `npm install`, `tsc + vite build` clean, `evenhub pack` → 41,261-byte
  `.ehpk`, and a dedicated simulator instance (port 9899) rendered the
  full HOME screen with live data. Only then adopted in the real app:
  package.json + `app.json` `min_sdk_version` bumped, rebuilt, repacked
  (41,263 bytes), and the whole verification pass re-run on 0.0.16.

### 8. Automation note

The simulator's `double_click` input works from LIST views (list → home
verified) but **killed the page when sent from a DETAIL view** (black
framebuffer, app gone; recovered by a simulator restart, watchlist
intact). All detail exits in tests and in the video use the on-screen
back rows. (On hardware, double-tap is a native gesture; the app's
handler follows the official template's pattern.)

### Verification screenshots (`app/docs/`)

| File | Shows |
| --- | --- |
| `day4-home.png` | HOME: spot, ★ top market, latest headline, nav rows |
| `day4-markets.png` | Markets list on the final build |
| `day4-trend-detail.png` | Market detail with the one-line 24h trend strip |
| `day4-alert.png` | HOME alert row + flagged row after a +5.0 pt watched move (test double) |
| `day4-alert-detail.png` | Detail alert line (test double) |
| `day4-digest.png` | Digest list with WatcherGuru merged in |
| `day4-morning-brief.png` | Morning brief: spot + top-3 markets (+ wire below the fold) |

### Demo video (re-cut)

- `demo/glance-demo.mp4` — **49.8 s, 1152×648, H.264, 790 KB** (copy in
  `~/workspace/your_files/Glance-demo.mp4`). Same pipeline as Day 3
  (framebuffer capture while the automation API drives the real tap
  flow, ×2 upscale, caption band per beat); every beat frame-checked on
  a contact sheet before assembly, including the post-detail beat.
- Beats: home → markets → market detail (trend) → one-line brief →
  digest → post detail → morning brief → home. All data in the video is
  the live system — no test double was used during recording (the alert
  feature is evidenced by the Day-4 screenshots above instead).

### Publication

- Public repo: **https://github.com/Scxfdarpo/glance-g2** — whole project
  (app + README + this log + demo), committed and pushed after the
  user's explicit go-ahead; the repo page was fetched afterwards to
  confirm the README and screenshots render.
```
