# BUIDL long description — V3 (Day-6 final upgrade applied)

> Prepared for the parent agent to paste over the current BUIDL
> description at https://dorahacks.io/build/51961. Reflects the Day-6
> final upgrade pass (working voice commands via a local Whisper STT
> service, five-coin spot, Hyperliquid perps panel). Structure
> unchanged from V2: Problem / Who it's for / How it works / Key
> features / Tech stack / Safety / Hackathon notes.
>
> CHANGES vs the V2 text currently on the BUIDL — for the parent's
> diff check:
> 1. "How it works": CoinGecko now five coins; Hyperliquid perps and
>    the local STT service added.
> 2. "Key features": Home glance now five-coin spot; NEW bullets
>    "Voice commands" and "Perps panel"; Morning brief line updated
>    to five-coin spot.
> 3. "Tech stack": faster-whisper STT service + Hyperliquid added.
> 4. "Hackathon notes": the Day-5 voice note ("tap-first by design")
>    is REPLACED by the shipped-pipeline note with the exact
>    verification boundary (mic capture on hardware untested).

---

## Problem

A crypto holder checks the same handful of things dozens of times a
day: spot prices, the prediction markets they follow, perp funding,
and the whale/news wire that moves them. Every check today means a
phone out of the pocket and a doom-scroll. The information is
glanceable; the device for it wasn't on your face.

## Who it's for

Anyone holding crypto who follows prediction markets or the Telegram
news wire — and wants the answer on the glasses they already wear,
not on a phone. Built and tested entirely in the free Even Hub
simulator; no G2 hardware needed to judge it.

## How it works

Glance is a WebView app for the Even Realities G2 (576×288 monochrome)
backed by a tiny zero-dependency Node proxy. The proxy fetches public,
read-only data server-side — Polymarket Gamma (odds), Polymarket CLOB
(24h price history), CoinGecko (spot for BTC, ETH, SOL, DOGE, XRP),
Hyperliquid (perpetual mark prices, funding, open interest) and the
public web previews of five Telegram channels — and serves slim JSON
shaped for a glance. A second local service transcribes voice
commands with a self-hosted Whisper model. The app refreshes every
60 seconds, shows a STALE marker instead of going blank when a fetch
fails, and falls back to fetching Polymarket directly if the proxy
is down. No API keys, no accounts, no mocks: every number on screen
is live.

## Key features

- **Home glance** — **five-coin spot** with 24h change (BTC/ETH on
  one row, SOL/DOGE/XRP on the next), your top watched market, a
  **biggest-mover row** (the fetched market with the largest 24h
  move), the latest wire headline, and a footer that counts what
  you hold (`1 watching · 1 paper open`). Every row is one tap from
  its detail.
- **Voice commands** — tap LISTEN, speak, tap STOP. The app records
  the microphone's raw PCM through the SDK and sends it to the
  Glance server, where a **local Whisper model** (faster-whisper —
  no cloud ASR, no API key) transcribes it; a deterministic parser
  turns the transcript into an intent that runs through the same
  actions as the taps: *"bitcoin price"* (answered on the spot
  screen), *"show markets"*, *"top market"*, *"watch bitcoin"*
  (watches the first matching live market and opens it), *"morning
  brief"*, *"latest news"*, *"perps"*. See the hackathon notes for
  exactly how this is verified.
- **Markets, with depth** — the **top 15** crypto events on
  Polymarket, one headline market per event (its most-traded market,
  so no sub-market floods), each row price-first.
- **Market detail** — YES/NO, 1-day move, 24h volume, liquidity, and a
  **24h trend strip with a direction arrow per hourly step**
  (`24h: 66↓65→65↓61↑62→62`) from the CLOB history endpoint. Every
  glyph was verified against the actual G2 framebuffer font.
- **Watchlist + move alerts** — one tap pins a market (★, persisted
  across restarts). If a watched market moves ≥3 points between
  refreshes, the glasses flag it in the list, on its detail, and on
  the home screen.
- **Paper positions** — one tap opens a $100 paper position on YES or
  NO at the live price; the detail carries its live mark
  (`Paper YES $100.00 @62% → $113.82 (+$13.82)`) and a one-tap close
  that settles at the live price. Positions persist across restarts.
  Paper only — simulated on-device, no funds, no keys.
- **Perps panel** — BTC/ETH/SOL perpetuals from Hyperliquid: mark
  price with the day move, **hourly funding rate** and **open
  interest** in USD, refreshed with the other feeds.
- **The wire, pre-filtered** — five public Telegram channels
  (whale_alert_io, cointelegraph, WatcherGuru, unfolded,
  cryptoquant_official) merged newest-first and deduped. Posts
  mentioning **BTC, ETH or ETF** are flagged with a `!` in the list
  and on the home headline, and the post detail names the match
  (`Mentions: BTC · ETF`) — a glance already tells you which posts
  can move your markets.
- **Briefs** — one tap rewrites any market or post as a single
  shareable line, composed on-device from the live numbers; a morning
  brief (five-coin spot + top-3 markets + top-2 headlines) is one
  tap from home.

## Tech stack

TypeScript + Vite in the G2 WebView (Even Hub SDK 0.0.16), a
zero-dependency Node proxy (standard library only, stale-while-
revalidate cache), a local speech-to-text service (Python +
faster-whisper, Whisper base model, int8 on CPU), Polymarket Gamma +
CLOB public APIs, CoinGecko public API (Kraken fallback),
Hyperliquid public API, Telegram public channel previews.
State (watchlist, last-seen prices, paper positions) persists in
on-device local storage. The installable build ships in the repo as
`app/glance.ehpk`.

## Safety

Read-only by construction. Glance displays public odds and public
posts; it places no trades and touches no funds. The one write
surface — paper positions — is a simulation stored on the device.
Voice audio travels only from the glasses to our own backend and is
transcribed locally; it is never sent to a cloud ASR or any third
party. No keys, no accounts, no custody, nothing to leak.

## Hackathon notes

- Tracks: **02 Crypto & DeFi** (primary) + **01 Messaging & News**.
- Everything was verified end-to-end in the Even Hub simulator with
  fresh framebuffer screenshots at every step (repo: `app/docs/`,
  including the Day-6 set). The watch-alert and paper-P&L paths were
  exercised against a documented local test double that rewrites one
  price in the feed, because a ≥3-point move cannot be ordered on
  cue from the live market; the technique and its results are
  disclosed in `BUILDLOG.md`.
- **Voice — shipped, with the verification boundary stated plainly.**
  The pipeline downstream of the microphone is verified end-to-end
  in the simulator: recorded spoken commands, converted to the SDK's
  exact frame format (raw PCM, s16le, 16 kHz, mono), were fed
  through the app's own code path (`src/voice.ts` → proxy `POST
  /stt` → local Whisper → intent parser) by a dev-only verification
  page that renders every state on the glasses display (repo:
  `app/docs/day6-voice-*.png`); the HTTP test suite passes 7/7
  commands with correct transcripts and intents at ~1–2 s each. The
  app's voice view renders its idle state in the simulator. What is
  **not** verified is real-microphone capture on hardware: the
  simulator has no mic (`audioControl(true)` returns `false`, zero
  audio frames — probed Day 2, re-confirmed Day 6, where the app
  shows an honest "mic unavailable in this environment" state). The
  record step uses only the documented SDK calls. The verification
  also caught a real bug: the `/stt` POST is CORS-preflighted and
  the proxy initially failed the preflight, which would have broken
  voice on hardware in exactly the same way; it is fixed and covered
  in the build log.
- Built solo during the hackathon window (Nov 26–29) from the
  official minimal template; the full day-by-day story, including
  the traps (63-byte list-item cap, cold-start-only page creation,
  glyphs the G2 font silently drops, a CORS preflight that only a
  POST can trigger), is in `BUILDLOG.md`.
