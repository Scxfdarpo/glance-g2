# Demo Day pack — Glance (Even Realities "Heads Up" Hackathon)

**Corrected schedule (per the organizers, updated Day 6):** the
top-20 finalists are announced **Nov 30 – Dec 1**. Finalists pitch
**online on Discord on Dec 1, evening Dubai time**. **Dec 3 is an
awards ceremony in Dubai — there are no pitches on Dec 3.**

The script below is built for **3 minutes** of live pitch plus Q&A.
Everything runs on the real app with real data. The one exception is
framed honestly inside the script: the simulator has no microphone,
so the voice beat runs the *pipeline* on a recorded command through
the app's exact code path (the project's documented test-double
pattern) — and says so out loud.

## Before the slot (15 min ahead)

1. Start the stack: `npm run proxy` (terminal A), `npm run stt`
   (terminal B — the local Whisper service; wait for "model ready"),
   `npm run dev` (terminal C), `npm run simulate`.
2. Confirm the home screen shows live spot prices (five coins, two
   rows) and a fresh `updated HH:MM` header (not STALE). Open the
   PERPS view once so its data is warm.
3. Seed the state so every feature is visible in one pass:
   - Watch one market (★) from its detail page.
   - Open one paper position ($100 YES or NO) on any liquid market.
   - Both persist across restarts, so this survives a simulator
     relaunch — do it once, verify the home footer reads
     `1 watching · 1 paper open`.
4. Open a second simulator (or a browser tab ready to relaunch) on
   `http://localhost:5173/voice-test.html?cmd=cmd4_watch_bitcoin`
   for the voice beat. Keep `BUILDLOG.md` open too — judges who ask
   "how do you know?" get pointed at dated framebuffer screenshots
   (`app/docs/day2-*` … `app/docs/day6-*`).

## The 3-minute script

**0:00 — Home (the promise).** "This is Glance. One screen: five-coin
spot — BTC, ETH, SOL, DOGE, XRP — the market I watch, the biggest
mover of the day, and the latest headline from the wire. The footer
counts what I'm holding — one watched market, one paper position.
Everything here is live and refreshes every 60 seconds."

**0:25 — Markets (depth).** Tap the spot row. "The top 15 crypto
events on Polymarket right now — one headline market per event, its
most-traded market, price-first. No sub-market floods." Scroll a few
rows to show the depth past 10.

**0:50 — Detail + trend.** Tap any market. "YES/NO, the day move,
volume, liquidity — and the last 24 hours as a trend strip with a
direction arrow on every hourly step, from Polymarket's CLOB history
endpoint. The arrows are real font glyphs — we verified them in the
framebuffer; the block-char sparklines our first prototype used are
silently missing from the G2 font, so we replaced them."

**1:15 — Watch + alerts (the glasses speak first).** Tap "Watch this
market" (or show the already-watched one). "One tap pins it. If it
moves three points or more between refreshes, the list flags it, the
detail carries an alert line, and the home screen puts the alert
above everything. You don't check Glance; Glance checks for you."

**1:35 — Paper position (the write action).** Open the seeded
position's detail (or open one live). "One tap opens a $100 paper
position at the live price. The detail marks it to market — entry,
current value, P&L — and one more tap closes it at the live price.
It persists across restarts. It's paper on purpose: the full trading
loop, zero funds, zero keys."

**1:55 — Perps.** Back → home → PERPS. "Hyperliquid perpetuals —
BTC, ETH, SOL mark prices with the day move, hourly funding, open
interest. The futures side of the same glance, from Hyperliquid's
public API."

**2:10 — Voice.** Home → Voice. "And you can just ask. On the
glasses: tap LISTEN, say *'watch bitcoin'* or *'bitcoin price'*,
tap STOP. The SDK gives us raw microphone PCM — no speech-to-text —
so the audio goes to our own server, where a local Whisper model
transcribes it. No cloud ASR, no API key." Switch to the
verification page as it runs: "The simulator has no microphone, so
here is the honest version of the demo: a recorded command fed
through the app's exact code path — same bytes, same endpoint, same
parser. *Watch bitcoin* — heard, parsed, and the app watches the
first matching market and opens it. The only step we cannot show
you here is the physical microphone, and we'd rather say that than
fake it."

**2:40 — The wire + close.** Back → digest. "Five public Telegram
channels merged into one wire — whale alerts and headlines, newest
first, deduped; posts that mention BTC, ETH or ETF are flagged. And
one tap composes the morning brief — spot, top markets, headlines —
as one shareable screen. Glance: spot, odds, perps and the wire, on
the glasses you're already wearing — by tap or by voice. No phone,
no keys, no mocks."

## If something goes wrong live

- **Header shows STALE / proxy died:** say so, don't hide it — "the
  app keeps the last good data and marks it STALE rather than going
  blank; the markets feed also falls back to Polymarket directly."
  Restart the proxy; the next 60 s refresh recovers.
- **Voice beat: STT service down:** the verification page shows its
  error state naming both services. Restart `npm run stt`, relaunch
  the page. If it stays down, show the Day-6 screenshots
  (`app/docs/day6-voice-result.png`) and give the honest summary —
  the pipeline is also covered by a 7/7 HTTP test suite in the repo.
- **Simulator page breaks after a reload:** cold-restart the
  simulator (page creation only succeeds on a cold start — a known
  SDK trap, documented in the log). State persists; you're back on
  the home screen in seconds.
- **A price looks stale by a minute:** refresh is 60 s by design —
  "glanceable, not a trading terminal."

## Likely judge Q&A — honest answers

**Where does the data come from? Is it real?**
All live and public: Polymarket Gamma for odds, Polymarket CLOB
`prices-history` for the trend, CoinGecko for five-coin spot
(Kraken fallback in the proxy), Hyperliquid's public API for perps,
and the public web previews (`t.me/s/…`) of five Telegram channels.
No API keys, no accounts, no mock or fixture data anywhere in the
system — the offline path shows a STALE/retry state, never invented
numbers.

**Why the proxy? Can't the glasses call the APIs directly?**
The WebView may only call origins whitelisted in the manifest, and
the sources are awkward from a WebView: Telegram exists only as HTML
pages that need parsing, and nothing is shaped for a 576×288 glance.
The proxy is zero-dependency Node with a stale-while-revalidate
cache. And if the proxy is down, the markets feed does fall back to
Gamma directly — verified in the simulator.

**How does voice work — and how was it verified without a mic?**
The SDK delivers raw PCM only, so the app POSTs the recorded PCM to
our proxy, which forwards it to a local faster-whisper service —
transcription happens on our own machine; there is no cloud ASR.
Verification: the simulator has no microphone (audioControl returns
false, zero frames — probed twice), so we fed recorded spoken
commands, converted to the SDK's exact frame format, through the
app's own code path via a dev-only page that renders every pipeline
state on the glasses display. 7/7 commands transcribe and parse
correctly (~1–2 s each); the screenshots are `app/docs/day6-voice-*`.
What we do not claim: the physical mic capture on hardware — the
record step uses only the documented SDK calls, but the first real
capture happens on a physical G2. The verification also caught a
real CORS-preflight bug in the proxy that would have broken voice
on hardware identically — fixed, and in the log.

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
paper positions, flags, briefs, perps, the local STT service and
this documentation were built Nov 26–29, in the open, in the repo's
build log.
