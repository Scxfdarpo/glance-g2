# Demo Day pack — Glance (Even Realities "Heads Up" Hackathon)

Demo Day: **Dec 3, 14:00–18:00 Dubai time**, finalists only, remote
demo allowed. Slot length isn't published; the script below is built
for **3 minutes** of live demo plus Q&A. Everything runs on the real
app with real data — no slides needed, no test double during the demo.

## Before the slot (15 min ahead)

1. Start the stack: `npm run proxy` (terminal A), `npm run dev`
   (terminal B), `npm run simulate` — or, if a G2 is available, serve
   the app and join via the Even Hub QR flow.
2. Confirm the home screen shows live spot prices and a fresh
   `updated HH:MM` header (not STALE).
3. Seed the state so every feature is visible in one pass:
   - Watch one market (★) from its detail page.
   - Open one paper position ($100 YES or NO) on any liquid market.
   - Both persist across restarts, so this survives a simulator
     relaunch — do it once, verify the home footer reads
     `1 watching · 1 paper open`.
4. Keep this file open on a second screen. Keep `BUILDLOG.md` open
   too — judges who ask "how do you know?" get pointed at dated
   framebuffer screenshots (`app/docs/day2-*` … `day5-*`).

## The 3-minute script

**0:00 — Home (the promise).** "This is Glance. One screen: BTC and
ETH spot, the market I watch, the biggest mover of the day, and the
latest headline from the wire. The footer counts what I'm holding —
one watched market, one paper position. Everything here is live and
refreshes every 60 seconds."
→ Point at the biggest-mover row: "The app computes this from the
same feed — the market with the largest 24-hour move."

**0:30 — Markets (depth).** Tap the spot row. "The top 15 crypto
events on Polymarket right now — one headline market per event, its
most-traded market, price-first. No sub-market floods." Scroll a few
rows to show the depth past 10.

**1:00 — Detail + trend.** Tap any market. "YES/NO, the day move,
volume, liquidity — and the last 24 hours as a trend strip with a
direction arrow on every hourly step, from Polymarket's CLOB history
endpoint. The arrows are real font glyphs — we verified them in the
framebuffer; the block-char sparklines our first prototype used are
silently missing from the G2 font, so we replaced them."

**1:30 — Watch + alerts (the glasses speak first).** Tap "Watch this
market" (or show the already-watched one). "One tap pins it. If it
moves three points or more between refreshes, the list flags it, the
detail carries an alert line, and the home screen puts the alert
above everything. You don't check Glance; Glance checks for you."

**1:50 — Paper position (the write action).** Open the seeded
position's detail (or open one live). "One tap opens a $100 paper
position at the live price. The detail marks it to market —
entry, current value, P&L — and one more tap closes it at the live
price. It persists across restarts. It's paper on purpose: the full
trading loop, zero funds, zero keys."

**2:20 — The wire (Track 01).** Back → switch feed → digest. "Five
public Telegram channels merged into one wire — whale alerts and
headlines, newest first, deduped. Posts that mention BTC, ETH or ETF
carry a flag" — tap the flagged post — "and the detail names what it
matched. A glance at the wire already tells you which posts can move
your markets."

**2:45 — Morning brief + close.** Back → home → Morning Brief. "One
tap composes the whole morning — spot, top markets, top headlines —
as one shareable screen, written on-device from the live numbers.
Glance: spot, odds and the wire, on the glasses you're already
wearing. No phone, no keys, no mocks."

## If something goes wrong live

- **Header shows STALE / proxy died:** say so, don't hide it — "the
  app keeps the last good data and marks it STALE rather than going
  blank; the markets feed also falls back to Polymarket directly."
  Restart the proxy; the next 60 s refresh recovers.
- **Simulator page breaks after a reload:** cold-restart the
  simulator (page creation only succeeds on a cold start — a known
  SDK trap, documented in the log). State persists; you're back on
  the home screen in seconds.
- **A price looks stale by a minute:** refresh is 60 s by design —
  "glanceable, not a trading terminal."

## Likely judge Q&A — honest answers

**Where does the data come from? Is it real?**
All live and public: Polymarket Gamma for odds, Polymarket CLOB
`prices-history` for the trend, CoinGecko for spot (Kraken fallback
in the proxy), and the public web previews (`t.me/s/…`) of five
Telegram channels. No API keys, no accounts, no mock or fixture data
anywhere in the system — the offline path shows a STALE/retry state,
never invented numbers.

**Why the proxy? Can't the glasses call the APIs directly?**
The WebView may only call origins whitelisted in the manifest, and
the sources are awkward from a WebView: Telegram exists only as HTML
pages that need parsing, and nothing is shaped for a 576×288 glance.
The proxy is zero-dependency Node with a stale-while-revalidate
cache. And if the proxy is down, the markets feed does fall back to
Gamma directly — verified in the simulator.

**Why no voice? The rubric mentions voice.**
Honestly scoped out, after verifying rather than assuming: the SDK
exposes raw PCM audio only — there is no speech-to-text in it — and
the simulator's microphone cannot be opened at all
(`audioControl(true)` returns `false`, zero frames arrive). Voice
would need an external ASR service behind the proxy and real
hardware to test. We chose not to fake it; the tap flows put every
answer one or two taps away. The probe evidence is in the build log.

**Is the paper trading real trading?**
No — deliberately. It's a $100 simulated position stored on-device,
marked to the live price. The hackathon judging rewards a working
read-and-write loop; custody, keys and real orders would add risk,
not signal. The safety story is the product story: read-only data,
on-device state, nothing to leak.

**How were alerts and P&L verified if markets won't move on cue?**
With a documented local test double: a passthrough proxy that
rewrites exactly one price in the feed, so the app's own alert and
mark-to-market code runs end-to-end. Screenshots and the technique
are disclosed in `BUILDLOG.md` (Days 4–5). The demo you just saw ran
on the untouched live feed.

**Why 15 markets? Why these keyword flags?**
Fifteen is where the list stays glanceable — one fact per row, the
63-byte firmware cap per row respected. The flags (BTC/ETH/ETF) are
the terms that historically move the listed markets; the matcher is
word-boundary based so tickers inside other words don't fire.

**Business model?**
Glance is a companion layer, not a destination: the feed layer is
source-agnostic, so the same app pattern serves any odds/news source
(sports books, other prediction venues, any Telegram/Discord wire).
A subscription companion for existing odds/news services — or a
white-label glance front-end for them — is the plausible path. No
custody and no trading keeps the regulatory surface at zero.

**What was built before the hackathon?**
Only the official `evenhub-templates/minimal` scaffold and the
public APIs themselves. The proxy, feeds, UI, watchlist, alerts,
paper positions, flags, briefs and this documentation were built
Nov 26–29, in the open, in the repo's build log.
