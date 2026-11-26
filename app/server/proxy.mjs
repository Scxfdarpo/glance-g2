// Glance backend proxy — zero-dependency Node (stdlib + global fetch).
//
// Why a proxy at all: the G2 WebView app must only talk to domains whitelisted
// in app.json, and Polymarket/Telegram do not send CORS headers that suit the
// WebView. All external fetches happen here, server-side; the glasses app only
// ever calls this proxy (whitelisted as our own domain once deployed).
//
// Endpoints:
//   GET /api/markets?limit=10       CRYPTO headline markets from Polymarket:
//                                   events filtered by the Gamma `crypto`
//                                   tag, ordered by event 24h volume; ONE
//                                   headline market per event (its most-
//                                   traded active market — no sub-market
//                                   floods). Slimmed to what the app renders.
//   GET /api/digest?limit=10        Latest posts merged from the public
//          &channels=a,b            Telegram previews (t.me/s/<channel>),
//                                   deduped, newest first, with timestamps.
//                                   `channels` defaults to the verified list.
//   GET /api/spot                   BTC + ETH spot price + 24h change
//                                   (CoinGecko public API, Kraken fallback).
//   GET /api/history?token=<id>     24h hourly Yes-price history for one
//                                   market from the Polymarket CLOB API.
//   GET /health                     { ok: true }
//
// Run:  node server/proxy.mjs        (PORT env, default 8787)

import { createServer } from 'node:http'

const PORT = process.env.PORT || 8787
const GAMMA = 'https://gamma-api.polymarket.com'
const CLOB = 'https://clob.polymarket.com'
const TG_PREVIEW = 'https://t.me/s'
// All five verified 2026-11-26 to serve a public t.me/s preview with
// parseable message text (WuBlockchain / CryptoQuant-bare-name have none).
const DEFAULT_CHANNELS = [
  'whale_alert_io',
  'cointelegraph',
  'WatcherGuru',
  'unfolded',
  'cryptoquant_official',
]

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const parseJsonArray = (s) => {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
const num = (v) => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

// --- Polymarket: crypto headline markets -------------------------------------

async function fetchMarkets(limit) {
  // Tag-filtered events, busiest first. 40 events is plenty of headroom:
  // after dropping events with no usable market we still fill `limit` rows.
  const url =
    `${GAMMA}/events?active=true&closed=false&limit=40` +
    `&order=volume24hr&ascending=false&tag_slug=crypto`
  const res = await fetch(url, { headers: { 'user-agent': 'glance-proxy/0.2' } })
  if (!res.ok) throw new Error(`gamma ${res.status}`)
  const events = await res.json()

  const picked = []
  for (const ev of events) {
    const usable = (ev.markets || []).filter(
      (m) => !m.closed && m.active !== false && m.outcomePrices,
    )
    if (!usable.length) continue
    // Headline market = the one traders actually trade in this event
    // (highest market-level 24h volume; liquidity breaks ties). Grouped
    // strike events put an arbitrary tail strike first, so markets[0]
    // is NOT the headline — volume is the honest selector.
    usable.sort((a, b) => (num(b.volume24hr) - num(a.volume24hr)) || (num(b.liquidity) - num(a.liquidity)))
    const m = usable[0]
    picked.push({
      question: m.question,
      outcomes: parseJsonArray(m.outcomes),
      prices: parseJsonArray(m.outcomePrices),
      volume24hr: num(m.volume24hr),
      eventVolume24hr: num(ev.volume24hr),
      liquidity: num(m.liquidity),
      oneDayPriceChange: m.oneDayPriceChange == null ? null : num(m.oneDayPriceChange),
      slug: m.slug,
      eventTitle: ev.title || '',
      // Yes-token id — the CLOB prices-history endpoint keys on it.
      yesTokenId: parseJsonArray(m.clobTokenIds)[0] || '',
    })
  }
  picked.sort((a, b) => b.eventVolume24hr - a.eventVolume24hr)
  return picked.slice(0, limit)
}

// --- Telegram public previews --------------------------------------------------

const stripTags = (s) =>
  s.replace(/<br\s*\/?>/gi, ' ')
   // Telegram linkifies names ("unknown wallet", hashtags) with anchors that
   // abut the next word ("…wallet</a>to…") — space anchors out before the
   // generic tag strip or words glue together. Whitespace collapses below.
   .replace(/<a[^>]*>/g, ' ').replace(/<\/a>/g, ' ')
   .replace(/<[^>]+>/g, '')
   .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
   .replace(/\s+/g, ' ')
   .trim()

const cleanPostText = (s) =>
  s
    // Flag emoji (regional-indicator pairs) are not in the G2 font — they
    // render as nothing and leave a dangling gap. Drop them.
    .replace(/[\u{1F1E6}-\u{1F1FF}]+/gu, '')
    // CoinTelegraph appends a footer of link labels ("News | Markets |
    // YouTube") — navigation chrome, not news. Drop a trailing chain of
    // 3+ short labels joined by " | ".
    .replace(/\s+[\p{L}\p{N}&'.-]{1,16}(\s*\|\s*[\p{L}\p{N}&'.-]{1,16}){2,}$/u, '')
    // whale_alert appends a "Details" link label to every post — drop it.
    .replace(/\s+Details$/, '')
    // "🚨 🚨 🚨 🚨" siren runs eat the row; collapse repeated token runs.
    // Guards are load-bearing: the token must be ≥2 chars and the run must
    // end at a boundary — a naive /(\S+)( \1)+/ backtracks to a single char
    // and eats real text ("has successfully" → "hasuccessfully",
    // "wallet to" → "walleto", "the theater" → "theater").
    .replace(/(\S{2,})((?: \1)+)(?=\s|$)/g, '$1')
    .trim()

async function fetchChannelPosts(channel) {
  const res = await fetch(`${TG_PREVIEW}/${channel}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
  })
  if (!res.ok) throw new Error(`telegram ${channel} ${res.status}`)
  const html = await res.text()
  // Split on each message's data-post anchor so id, timestamp and text stay
  // attached to the same message (the page is a flat list of widgets).
  const segments = html.split('data-post="').slice(1)
  const posts = []
  for (const seg of segments) {
    const id = seg.split('"', 1)[0]
    if (!id.startsWith(`${channel}/`)) continue
    const time = seg.match(/<time[^>]*datetime="([^"]+)"/)
    const text = seg.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)
    if (!text) continue // media-only post (photo/sticker) — nothing to glance at
    const cleaned = cleanPostText(stripTags(text[1]))
    if (!cleaned) continue
    posts.push({
      id,
      channel,
      text: cleaned,
      ts: time ? Date.parse(time[1]) || 0 : 0,
    })
  }
  return posts
}

async function fetchDigest(channels, limit) {
  const settled = await Promise.allSettled(channels.map(fetchChannelPosts))
  const byId = new Map()
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue
    for (const p of r.value) if (!byId.has(p.id)) byId.set(p.id, p)
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, limit)
}

// --- Spot prices (BTC / ETH) ---------------------------------------------------
// CoinGecko's public simple/price is the primary source (clean USD + 24h
// change in one call, no key). Kraken's public Ticker is the fallback —
// its "open today" vs last-trade gives an honest 24h change. Binance's
// public ticker is geo-blocked from our build VM, so it is not used.

async function fetchSpot() {
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum' +
      '&vs_currencies=usd&include_24hr_change=true'
    const res = await fetch(url, { headers: { 'user-agent': 'glance-proxy/0.3' } })
    if (!res.ok) throw new Error(`coingecko ${res.status}`)
    const d = await res.json()
    return {
      btc: { price: num(d.bitcoin && d.bitcoin.usd), change24h: num(d.bitcoin && d.bitcoin.usd_24h_change) },
      eth: { price: num(d.ethereum && d.ethereum.usd), change24h: num(d.ethereum && d.ethereum.usd_24h_change) },
      source: 'coingecko',
    }
  } catch {
    const res = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD')
    if (!res.ok) throw new Error(`kraken ${res.status}`)
    const d = await res.json()
    const pick = (k) => {
      const t = d.result && d.result[k]
      if (!t) return { price: 0, change24h: 0 }
      const last = num(t.c && t.c[0])
      const open = num(t.o)
      return { price: last, change24h: open ? ((last - open) / open) * 100 : 0 }
    }
    return { btc: pick('XXBTZUSD'), eth: pick('XETHZUSD'), source: 'kraken' }
  }
}

// --- Price history (one market's Yes token, 24h hourly) ------------------------

async function fetchHistory(token) {
  const url = `${CLOB}/prices-history?market=${token}&interval=1d&fidelity=60`
  const res = await fetch(url, { headers: { 'user-agent': 'glance-proxy/0.3' } })
  if (!res.ok) throw new Error(`clob ${res.status}`)
  const d = await res.json()
  const points = (d.history || [])
    .map((h) => ({ t: num(h.t), p: num(h.p) }))
    .filter((h) => h.t > 0)
  return points
}

// --- Response cache (stale-while-revalidate) ------------------------------------
// Upstream fetches (five Telegram pages, Gamma, CoinGecko) take seconds on
// a cold hit — longer than a glance should wait, and the app refreshes
// every 60 s anyway. Serve the cached copy instantly and refresh it in
// the background once it ages past its TTL; only the first-ever request
// for a key waits for the network. Startup pre-warming (below) means
// even that first request is normally already warm.

const cache = new Map() // key -> { at, data, pending }
async function cached(key, ttlMs, fetcher) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  if (hit && hit.data !== undefined) {
    if (!hit.pending) {
      hit.pending = fetcher()
        .then((data) => cache.set(key, { at: Date.now(), data, pending: null }))
        .catch(() => { hit.pending = null })
    }
    return hit.data
  }
  const data = await fetcher()
  cache.set(key, { at: Date.now(), data, pending: null })
  return data
}

// --- HTTP server ---------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true })
    if (url.pathname === '/api/markets') {
      const limit = Math.min(15, Math.max(1, Number(url.searchParams.get('limit')) || 10))
      return json(res, 200, { markets: await cached(`markets:${limit}`, 20_000, () => fetchMarkets(limit)) })
    }
    if (url.pathname === '/api/spot') {
      return json(res, 200, await cached('spot', 30_000, fetchSpot))
    }
    if (url.pathname === '/api/history') {
      const token = (url.searchParams.get('token') || '').replace(/[^0-9]/g, '')
      if (!token) return json(res, 400, { error: 'token required' })
      return json(res, 200, { points: await cached(`history:${token}`, 120_000, () => fetchHistory(token)) })
    }
    if (url.pathname === '/api/digest') {
      const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 10))
      const raw = url.searchParams.get('channels') || url.searchParams.get('channel') || ''
      const channels = raw
        ? raw.split(',').map((c) => c.replace(/[^a-zA-Z0-9_]/g, '')).filter(Boolean)
        : DEFAULT_CHANNELS
      const key = `digest:${channels.join(',')}:${limit}`
      return json(res, 200, { posts: await cached(key, 45_000, () => fetchDigest(channels, limit)) })
    }
    return json(res, 404, { error: 'not found' })
  } catch (err) {
    return json(res, 502, { error: String(err && err.message || err) })
  }
})

server.listen(PORT, () => {
  console.log(`glance-proxy listening on :${PORT}`)
  // Pre-warm the default views so the first glance is instant.
  void cached('markets:15', 20_000, () => fetchMarkets(15)).catch(() => {})
  void cached(`digest:${DEFAULT_CHANNELS.join(',')}:10`, 45_000, () => fetchDigest(DEFAULT_CHANNELS, 10)).catch(() => {})
  void cached('spot', 30_000, fetchSpot).catch(() => {})
})
