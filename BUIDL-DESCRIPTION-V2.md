# BUIDL long description — V2 (Day-5 upgrade applied)

> Prepared for the parent agent to paste over the current BUIDL
> description at https://dorahacks.io/build/51961. Reflects the Day-5
> upgrade pass (top-15 markets, biggest-mover row, paper positions,
> keyword flags, trend direction arrows, shipped .ehpk). Structure
> unchanged from the submitted V1: Problem / Who it's for / How it
> works / Key features / Tech stack / Safety / Hackathon notes.

---

## Problem

A crypto holder checks the same handful of things dozens of times a
day: BTC/ETH spot, the prediction markets they follow, and the
whale/news wire that moves them. Every check today means a phone out
of the pocket and a doom-scroll. The information is glanceable; the
device for it wasn't on your face.

## Who it's for

Anyone holding crypto who follows prediction markets or the Telegram
news wire — and wants the answer on the glasses they already wear,
not on a phone. Built and tested entirely in the free Even Hub
simulator; no G2 hardware needed to judge it.

## How it works

Glance is a WebView app for the Even Realities G2 (576×288 monochrome)
backed by a tiny zero-dependency Node proxy. The proxy fetches public,
read-only data server-side — Polymarket Gamma (odds), Polymarket CLOB
(24h price history), CoinGecko (BTC/ETH spot) and the public web
previews of five Telegram channels — and serves slim JSON shaped for
a glance. The app refreshes every 60 seconds, shows a STALE marker
instead of going blank when a fetch fails, and falls back to fetching
Polymarket directly if the proxy is down. No API keys, no accounts,
no mocks: every number on screen is live.

## Key features

- **Home glance** — BTC/ETH spot with 24h change, your top watched
  market, a **biggest-mover row** (the fetched market with the largest
  24h move), the latest wire headline, and a footer that counts what
  you hold (`1 watching · 1 paper open`). Every row is one tap from
  its detail.
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
- **The wire, pre-filtered** — five public Telegram channels
  (whale_alert_io, cointelegraph, WatcherGuru, unfolded,
  cryptoquant_official) merged newest-first and deduped. Posts
  mentioning **BTC, ETH or ETF** are flagged with a `!` in the list
  and on the home headline, and the post detail names the match
  (`Mentions: BTC · ETF`) — a glance already tells you which posts
  can move your markets.
- **Briefs** — one tap rewrites any market or post as a single
  shareable line, composed on-device from the live numbers; a morning
  brief (spot + top-3 markets + top-2 headlines) is one tap from home.

## Tech stack

TypeScript + Vite in the G2 WebView (Even Hub SDK 0.0.16), a
zero-dependency Node proxy (standard library only, stale-while-
revalidate cache), Polymarket Gamma + CLOB public APIs, CoinGecko
public API (Kraken fallback), Telegram public channel previews.
State (watchlist, last-seen prices, paper positions) persists in
on-device local storage. The installable build ships in the repo as
`app/glance.ehpk`.

## Safety

Read-only by construction. Glance displays public odds and public
posts; it places no trades and touches no funds. The one write
surface — paper positions — is a simulation stored on the device.
No keys, no accounts, no custody, nothing to leak.

## Hackathon notes

- Tracks: **02 Crypto & DeFi** (primary) + **01 Messaging & News**.
- Everything was verified end-to-end in the Even Hub simulator with
  fresh framebuffer screenshots at every step (repo: `app/docs/`,
  including the Day-5 set). The watch-alert and paper-P&L paths were
  exercised against a documented local test double that rewrites one
  price in the feed, because a ≥3-point move cannot be ordered on
  cue from the live market; the technique and its results are
  disclosed in `BUILDLOG.md`.
- **An honest note on voice:** the app is tap-first by design. The
  Even Hub SDK exposes raw PCM audio only — there is no speech-to-
  text in the SDK — and the simulator's microphone cannot be opened
  at all (verified: `audioControl(true)` returns `false`, zero audio
  frames). Rather than fake a voice demo, the tap flows are built so
  the answer is one or two taps away. The probe evidence is in the
  build log.
- Built solo during the hackathon window (Nov 26–29) from the
  official minimal template; the full day-by-day story, including
  the traps (63-byte list-item cap, cold-start-only page creation,
  glyphs the G2 font silently drops), is in `BUILDLOG.md`.
