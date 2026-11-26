// Feed access for Glance — typed wrappers over the backend proxy
// (server/proxy.mjs), plus every string the glasses render. Keeping all
// formatting here means main.ts is pure navigation/state.

import { PROXY_BASE_URL } from './config'

export interface Market {
  question: string
  outcomes: string[]
  prices: string[]
  volume24hr: number
  eventVolume24hr: number
  liquidity: number
  oneDayPriceChange: number | null
  slug: string
  eventTitle: string
  yesTokenId: string // CLOB token id of the Yes outcome (price history)
}

export interface SpotQuote {
  price: number
  change24h: number // percent, signed
}
export interface Spot {
  btc: SpotQuote
  eth: SpotQuote
  source: string
}

export interface HistoryPoint {
  t: number // epoch seconds
  p: number // Yes price, 0..1
}

export interface Post {
  id: string
  channel: string
  text: string
  ts: number // epoch ms (0 when the preview carried no timestamp)
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getJson<T>(path: string, timeoutMs = 6000): Promise<T> {
  const res = await fetchWithTimeout(`${PROXY_BASE_URL}${path}`, timeoutMs)
  if (!res.ok) throw new Error(`proxy ${res.status}`)
  return (await res.json()) as T
}

// --- Direct Gamma fallback -----------------------------------------------------
// Used only when the proxy cannot be reached. It mirrors the proxy's honest
// headline rule: crypto-tagged events, then each event's most-traded active
// market. Whether the WebView accepts this cross-origin response depends on
// Gamma's CORS policy at runtime; if it does not, the caller stays in the
// app's existing STALE/offline state rather than inventing data.

interface RawMarket {
  question?: unknown
  outcomes?: unknown
  outcomePrices?: unknown
  volume24hr?: unknown
  liquidity?: unknown
  oneDayPriceChange?: unknown
  slug?: unknown
  closed?: unknown
  active?: unknown
  clobTokenIds?: unknown
}

interface RawEvent {
  title?: unknown
  volume24hr?: unknown
  markets?: RawMarket[]
}

const asArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

const asNumber = (value: unknown): number => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

async function fetchMarketsDirect(limit: number): Promise<Market[]> {
  const url =
    'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=40' +
    '&order=volume24hr&ascending=false&tag_slug=crypto'
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`gamma ${res.status}`)
  const events = (await res.json()) as RawEvent[]
  const picked: Market[] = []

  for (const event of events) {
    const usable = (event.markets ?? []).filter(
      (m) => !m.closed && m.active !== false && m.outcomePrices,
    )
    if (!usable.length) continue
    usable.sort(
      (a, b) =>
        asNumber(b.volume24hr) - asNumber(a.volume24hr) ||
        asNumber(b.liquidity) - asNumber(a.liquidity),
    )
    const m = usable[0]
    picked.push({
      question: String(m.question ?? ''),
      outcomes: asArray(m.outcomes),
      prices: asArray(m.outcomePrices),
      volume24hr: asNumber(m.volume24hr),
      eventVolume24hr: asNumber(event.volume24hr),
      liquidity: asNumber(m.liquidity),
      oneDayPriceChange:
        m.oneDayPriceChange == null ? null : asNumber(m.oneDayPriceChange),
      slug: String(m.slug ?? ''),
      eventTitle: String(event.title ?? ''),
      yesTokenId: asArray(m.clobTokenIds)[0] ?? '',
    })
  }

  return picked
    .sort((a, b) => b.eventVolume24hr - a.eventVolume24hr)
    .slice(0, limit)
}

export async function fetchMarkets(limit: number): Promise<Market[]> {
  try {
    const data = await getJson<{ markets: Market[] }>(`/api/markets?limit=${limit}`)
    return data.markets
  } catch (proxyError) {
    try {
      return await fetchMarketsDirect(limit)
    } catch {
      throw proxyError
    }
  }
}

/** Merged digest across all verified channels, newest first. */
export async function fetchDigest(limit: number): Promise<Post[]> {
  // Generous timeout: a cold proxy fetches five Telegram pages upstream.
  const data = await getJson<{ posts: Post[] }>(`/api/digest?limit=${limit}`, 15_000)
  return data.posts
}

/** BTC + ETH spot via the proxy; CoinGecko direct as the fallback. */
export async function fetchSpot(): Promise<Spot> {
  try {
    return await getJson<Spot>('/api/spot')
  } catch (proxyError) {
    try {
      const res = await fetchWithTimeout(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum' +
          '&vs_currencies=usd&include_24hr_change=true',
      )
      if (!res.ok) throw new Error(`coingecko ${res.status}`)
      const d = (await res.json()) as {
        bitcoin?: { usd?: number; usd_24h_change?: number }
        ethereum?: { usd?: number; usd_24h_change?: number }
      }
      return {
        btc: { price: d.bitcoin?.usd ?? 0, change24h: d.bitcoin?.usd_24h_change ?? 0 },
        eth: { price: d.ethereum?.usd ?? 0, change24h: d.ethereum?.usd_24h_change ?? 0 },
        source: 'coingecko-direct',
      }
    } catch {
      throw proxyError
    }
  }
}

/** 24h hourly Yes-price history for one market (CLOB, via proxy or direct). */
export async function fetchHistory(tokenId: string): Promise<HistoryPoint[]> {
  if (!tokenId) return []
  try {
    const data = await getJson<{ points: HistoryPoint[] }>(`/api/history?token=${tokenId}`)
    return data.points
  } catch {
    const res = await fetchWithTimeout(
      `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=1d&fidelity=60`,
    )
    if (!res.ok) throw new Error(`clob ${res.status}`)
    const d = (await res.json()) as { history?: { t: number; p: number }[] }
    return (d.history ?? []).map((h) => ({ t: h.t, p: h.p }))
  }
}

// --- Numbers -----------------------------------------------------------------

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

export function yesPct(m: Market): number | null {
  const p = Number(m.prices?.[0])
  return Number.isFinite(p) ? Math.round(p * 100) : null
}
export function noPct(m: Market): number | null {
  const p = Number(m.prices?.[1])
  return Number.isFinite(p) ? Math.round(p * 100) : null
}

/** "+3.1 pts today" / "-18.5 pts today" / "" when the API has no 1d move. */
export function moveStr(m: Market): string {
  if (m.oneDayPriceChange == null || !Number.isFinite(m.oneDayPriceChange)) return ''
  const pts = m.oneDayPriceChange * 100
  if (Math.abs(pts) < 0.05) return 'flat today'
  return `${pts > 0 ? '▲' : '▼'}${Math.abs(pts).toFixed(1)} pts today`
}

export function relTime(ts: number, now = Date.now()): string {
  if (!ts) return ''
  const mins = Math.max(0, Math.round((now - ts) / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

// --- Glance formatting ---------------------------------------------------------
// The G2 canvas is 576px wide with a single fixed font; list item names are
// capped at 63 bytes by the firmware. Keep every row short and front-loaded:
// the eye should get the fact before the row ends.

const MAX_ITEM_BYTES = 60 // firmware cap is 63 bytes per list item name
const encoder = new TextEncoder()

export function clampItem(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  if (encoder.encode(flat).length <= MAX_ITEM_BYTES) return flat
  // Cut by characters until the UTF-8 encoding fits (emoji are 4 bytes each,
  // so a 60-char row of emoji would otherwise blow the 63-byte cap and the
  // whole startup page is rejected as invalid).
  let out = flat
  while (encoder.encode(out).length > MAX_ITEM_BYTES - 3) out = out.slice(0, -1)
  return out + '…'
}

/** "+4.2" / "-3.0" — a signed watch-alert delta in points. */
export function deltaStr(deltaPts: number): string {
  return `${deltaPts >= 0 ? '+' : '-'}${Math.abs(deltaPts).toFixed(1)}`
}

/** Watch-alert delta in points between a stored Yes fraction and now. */
export function watchDeltaPts(prevFrac: number, m: Market): number | null {
  const now = Number(m.prices?.[0])
  if (!Number.isFinite(now) || !Number.isFinite(prevFrac)) return null
  return (now - prevFrac) * 100
}

/** Market list row — price first so the clamp can never eat the number.
 *  `alertDelta` (points, signed) flags a watched market that just moved. */
export function marketRow(m: Market, watched: boolean, alertDelta?: number | null): string {
  const pct = yesPct(m)
  const flag =
    alertDelta != null && Math.abs(alertDelta) >= 3
      ? ` ${alertDelta >= 0 ? '▲' : '▼'}${deltaStr(alertDelta)}`
      : ''
  const head = pct === null ? (watched ? '★ ' : '') : `${watched ? '★ ' : ''}Yes ${pct}%${flag} · `
  return clampItem(`${head}${m.question}`)
}

/** Digest list row — age + source first, then the headline. */
export function postRow(p: Post, now = Date.now()): string {
  const age = relTime(p.ts, now)
  return clampItem(`${age ? `${age} ` : ''}@${p.channel}: ${p.text}`)
}

/** Market detail page body. */
export function marketDetail(m: Market): string {
  const yes = yesPct(m)
  const no = noPct(m)
  const lines = [m.question]
  if (yes !== null) lines.push(`YES ${yes}%${no !== null ? ` · NO ${no}%` : ''}`)
  const mv = moveStr(m)
  if (mv) lines.push(`1d move: ${mv}`)
  lines.push(`24h vol ${fmtUsd(m.volume24hr)} · liquidity ${fmtUsd(m.liquidity)}`)
  if (m.eventTitle && m.eventTitle !== m.question) lines.push(`Event: ${m.eventTitle}`)
  return lines.join('\n')
}

/** Digest detail page body — the full message. */
export function postDetail(p: Post, now = Date.now()): string {
  const age = relTime(p.ts, now)
  return `@${p.channel}${age ? ` · ${age} ago` : ''}\n${p.text}`
}

// --- One-line briefs (the read-and-write "act in seconds" action) --------------
// Composed on-device from the live numbers — no LLM call, no waiting: tap
// "Brief" and the item is already rewritten as one shareable line.

export function marketBrief(m: Market): string {
  const pct = yesPct(m)
  const bits: string[] = [m.question]
  if (pct !== null) bits.push(`Yes ${pct}%`)
  const mv = moveStr(m)
  if (mv) bits.push(mv)
  bits.push(`${fmtUsd(m.volume24hr)} traded in 24h`)
  return bits.join(' — ')
}

export function postBrief(p: Post, now = Date.now()): string {
  const age = relTime(p.ts, now)
  // Headline = first sentence (or first clause) of the post.
  const head = p.text.split(/(?<=[.!?])\s/)[0] || p.text
  const short = head.length > 150 ? head.slice(0, 147).trimEnd() + '…' : head
  return `@${p.channel}${age ? `, ${age} ago` : ''}: ${short}`
}

// --- Spot + home glance ----------------------------------------------------------

const groupThousands = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function fmtSpotPrice(n: number): string {
  return n > 0 ? `$${groupThousands(n)}` : '$—'
}

export function changeStr(change24h: number): string {
  if (!Number.isFinite(change24h)) return ''
  const arrow = change24h > 0.05 ? '▲' : change24h < -0.05 ? '▼' : '·'
  return `${arrow}${Math.abs(change24h).toFixed(1)}%`
}

/** One-row home glance: "BTC $60,902 ▲3.1% · ETH $1,697 ▲2.5%". */
export function spotLine(spot: Spot): string {
  return clampItem(
    `BTC ${fmtSpotPrice(spot.btc.price)} ${changeStr(spot.btc.change24h)} · ` +
      `ETH ${fmtSpotPrice(spot.eth.price)} ${changeStr(spot.eth.change24h)}`,
  )
}

// --- Price-history trend (market detail) ------------------------------------------

/** "24h: 30→29→36→47→25→15" — six samples across the day, one line. */
export function trendStrip(points: HistoryPoint[]): string {
  if (points.length < 2) return ''
  const picks: number[] = []
  const n = 6
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (points.length - 1)) / (n - 1))
    picks.push(Math.round(points[idx].p * 100))
  }
  return `24h: ${picks.join('→')}`
}

// NOTE: a block-char sparkline (U+2581–U+2588) was prototyped and cut —
// framebuffer analysis in the simulator showed zero ink for those glyphs
// (not in the LVGL font, silently dropped like ⇄/✎). The textual strip
// above is the shipped trend rendering.

// --- Morning brief (the read-and-write centerpiece) -------------------------------
// One tap composes the whole morning: spot, the top markets, the wire.
// Plain text lines sized for the 576×288 canvas; composed on-device from
// live data, like the one-line briefs.

export function morningBrief(spot: Spot | null, markets: Market[], posts: Post[], now = Date.now()): string {
  const lines: string[] = []
  if (spot) {
    lines.push(
      `BTC ${fmtSpotPrice(spot.btc.price)} ${changeStr(spot.btc.change24h)} · ` +
        `ETH ${fmtSpotPrice(spot.eth.price)} ${changeStr(spot.eth.change24h)}`,
    )
  }
  lines.push('', 'Top markets:')
  for (const m of markets.slice(0, 3)) {
    const pct = yesPct(m)
    lines.push(`· Yes ${pct === null ? '—' : pct}% — ${m.question}`)
  }
  lines.push('', 'The wire:')
  for (const p of posts.slice(0, 2)) {
    lines.push(`· ${postBrief(p, now)}`)
  }
  lines.push('', '— composed by Glance from live data.')
  return lines.join('\n')
}
