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
  sol: SpotQuote
  doge: SpotQuote
  xrp: SpotQuote
  source: string
}

/** Spot quote by coin symbol, for voice answers ("bitcoin price"). */
export function spotQuote(spot: Spot, coin: string): SpotQuote | null {
  switch (coin) {
    case 'BTC': return spot.btc
    case 'ETH': return spot.eth
    case 'SOL': return spot.sol
    case 'DOGE': return spot.doge
    case 'XRP': return spot.xrp
    default: return null
  }
}

export interface Perp {
  coin: string // BTC / ETH / SOL
  markPx: number
  funding: number // hourly rate as a fraction (0.0001 = 0.01%/h)
  openInterest: number // coin units
  openInterestUsd: number
  dayChange: number // percent, signed
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

/** Five-coin spot via the proxy; CoinGecko direct as the fallback. */
export async function fetchSpot(): Promise<Spot> {
  try {
    return await getJson<Spot>('/api/spot')
  } catch (proxyError) {
    try {
      const res = await fetchWithTimeout(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple' +
          '&vs_currencies=usd&include_24hr_change=true',
      )
      if (!res.ok) throw new Error(`coingecko ${res.status}`)
      const d = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number } | undefined>
      const pick = (id: string): SpotQuote => ({
        price: d[id]?.usd ?? 0,
        change24h: d[id]?.usd_24h_change ?? 0,
      })
      return {
        btc: pick('bitcoin'),
        eth: pick('ethereum'),
        sol: pick('solana'),
        doge: pick('dogecoin'),
        xrp: pick('ripple'),
        source: 'coingecko-direct',
      }
    } catch {
      throw proxyError
    }
  }
}

/** BTC/ETH/SOL perpetuals (Hyperliquid) via the proxy; the public info
 *  API direct as the fallback (same slimming as the proxy). */
export async function fetchPerps(): Promise<Perp[]> {
  try {
    const data = await getJson<{ perps: Perp[] }>('/api/perps')
    return data.perps
  } catch (proxyError) {
    return await fetchPerpsDirect(proxyError)
  }
}

async function fetchPerpsDirect(proxyError: unknown): Promise<Perp[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`hyperliquid ${res.status}`)
    const [meta, ctxs] = (await res.json()) as [
      { universe: { name: string; isDelisted?: boolean }[] },
      Record<string, string>[],
    ]
    const wanted = ['BTC', 'ETH', 'SOL']
    const out: Perp[] = []
    meta.universe.forEach((asset, i) => {
      if (!wanted.includes(asset.name) || asset.isDelisted) return
      const c = ctxs[i] ?? {}
      const mark = Number(c.markPx) || 0
      const oi = Number(c.openInterest) || 0
      const prev = Number(c.prevDayPx) || 0
      out.push({
        coin: asset.name,
        markPx: mark,
        funding: Number(c.funding) || 0,
        openInterest: oi,
        openInterestUsd: oi * mark,
        dayChange: prev ? (mark / prev - 1) * 100 : 0,
      })
    })
    return out.sort((a, b) => wanted.indexOf(a.coin) - wanted.indexOf(b.coin))
  } catch {
    throw proxyError
  } finally {
    clearTimeout(timer)
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
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`
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

/** Market-moving keywords a digest post can be flagged for. The wire is
 *  five channels of firehose; a post that names BTC, ETH or an ETF is the
 *  one most likely to explain the next odds move, so it gets a marker. */
const FLAG_PATTERNS: { tag: string; re: RegExp }[] = [
  { tag: 'BTC', re: /\bBTC\b|\$BTC\b|Bitcoin/i },
  { tag: 'ETH', re: /\bETH\b|\$ETH\b|Ethereum/i },
  { tag: 'ETF', re: /\bETF\b/ },
]
export function postFlags(p: Post): string[] {
  return FLAG_PATTERNS.filter((f) => f.re.test(p.text)).map((f) => f.tag)
}

/** Digest list row — age + source first, then the headline. Posts that
 *  mention BTC/ETH/ETF are prefixed with the alert marker `!` (the same
 *  marker HOME uses for "look at this first"). */
export function postRow(p: Post, now = Date.now()): string {
  const age = relTime(p.ts, now)
  const flag = postFlags(p).length ? '! ' : ''
  return clampItem(`${flag}${age ? `${age} ` : ''}@${p.channel}: ${p.text}`)
}

/** Market detail lines; the Event line (when present) is always last so
 *  callers can pop it and re-append it after higher-value lines. */
export function marketDetailLines(m: Market): string[] {
  const yes = yesPct(m)
  const no = noPct(m)
  const lines = [m.question]
  if (yes !== null) lines.push(`YES ${yes}%${no !== null ? ` · NO ${no}%` : ''}`)
  const mv = moveStr(m)
  if (mv) lines.push(`1d move: ${mv}`)
  lines.push(`24h vol ${fmtUsd(m.volume24hr)} · liquidity ${fmtUsd(m.liquidity)}`)
  if (m.eventTitle && m.eventTitle !== m.question) lines.push(`Event: ${m.eventTitle}`)
  return lines
}

/** Market detail page body. */
export function marketDetail(m: Market): string {
  return marketDetailLines(m).join('\n')
}

/** Digest detail page body — the full message. */
export function postDetail(p: Post, now = Date.now()): string {
  const age = relTime(p.ts, now)
  const flags = postFlags(p)
  const head = `@${p.channel}${age ? ` · ${age} ago` : ''}`
  return flags.length ? `${head}\nMentions: ${flags.join(' · ')}\n${p.text}` : `${head}\n${p.text}`
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

/** Compact price for the second spot row, where three coins share
 *  60 bytes: "$70.9" / "$0.941" / "$0.057" — glance precision, honestly
 *  rounded; the full precision lives one tap away on the wire. */
export function fmtSpotCompact(n: number): string {
  if (!(n > 0)) return '$—'
  if (n >= 1000) return fmtSpotPrice(n)
  if (n >= 10) return `$${n.toFixed(1)}`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toFixed(3)}`
}

/** Second home spot row: "SOL $70.9▼3.5% · DOGE $0.057▼2.7% · XRP $0.941▼4.0%".
 *  No space before the change arrow: with three coins, three prices and
 *  three changes, the spaced form lands at ~61 bytes and the 63-byte
 *  firmware cap eats the last coin's change (seen in the Day-6 first
 *  framebuffer pass). This form is ~58 bytes — everything survives. */
export function spotLine2(spot: Spot): string {
  return clampItem(
    `SOL ${fmtSpotCompact(spot.sol.price)}${changeStr(spot.sol.change24h)} · ` +
      `DOGE ${fmtSpotCompact(spot.doge.price)}${changeStr(spot.doge.change24h)} · ` +
      `XRP ${fmtSpotCompact(spot.xrp.price)}${changeStr(spot.xrp.change24h)}`,
  )
}

// --- Hyperliquid perps (panel body) ------------------------------------------------

/** Signed hourly funding as text: "+0.0059%/h" / "-0.0001%/h". */
export function fundingStr(funding: number): string {
  const pct = funding * 100
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : ''
  return `${sign}${Math.abs(pct).toFixed(4)}%/h`
}

/** Perps panel body — one coin per two lines, sized for the text box. */
export function perpLines(perps: Perp[]): string {
  if (!perps.length) return 'Perps unavailable — Hyperliquid did not answer.\nTap back and retry in a moment.'
  const lines: string[] = []
  for (const p of perps) {
    lines.push(
      `${p.coin} perp ${p.markPx >= 100 ? fmtSpotPrice(p.markPx) : fmtSpotCompact(p.markPx)} ${changeStr(p.dayChange)} today`,
      `funding ${fundingStr(p.funding)} · open interest ${fmtUsd(p.openInterestUsd)}`,
      '',
    )
  }
  lines.push('— Hyperliquid perpetuals, live. Funding is hourly.')
  return lines.join('\n')
}

// --- Price-history trend (market detail) ------------------------------------------

/** "24h: 30↑35↑44↓22↓16↓13" — six samples across the day, one line, each
 *  separator showing the direction into the next sample (↑ up, ↓ down,
 *  → flat). Day 5: ↑/↓ (U+2191/U+2193) were verified for ink in the
 *  simulator framebuffer before adoption — see BUILDLOG Day 5. */
export function trendStrip(points: HistoryPoint[]): string {
  if (points.length < 2) return ''
  const picks: number[] = []
  const n = 6
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (points.length - 1)) / (n - 1))
    picks.push(Math.round(points[idx].p * 100))
  }
  let out = `24h: ${picks[0]}`
  for (let i = 1; i < picks.length; i++) {
    out += `${picks[i] > picks[i - 1] ? '↑' : picks[i] < picks[i - 1] ? '↓' : '→'}${picks[i]}`
  }
  return out
}

// NOTE: a block-char sparkline (U+2581–U+2588) was prototyped and cut —
// framebuffer analysis in the simulator showed zero ink for those glyphs
// (not in the LVGL font, silently dropped like ⇄/✎). The textual strip
// above is the shipped trend rendering.

// --- Biggest mover (home glance) -------------------------------------------------
// One of the home rows answers "what moved most while I wasn't looking":
// the fetched market with the largest absolute 24h move, whatever it is.

export function biggestMover(markets: Market[]): Market | null {
  let best: Market | null = null
  for (const m of markets) {
    if (m.oneDayPriceChange == null || !Number.isFinite(m.oneDayPriceChange)) continue
    if (!best || Math.abs(m.oneDayPriceChange) > Math.abs(best.oneDayPriceChange!)) best = m
  }
  return best
}

/** Home row label: "Biggest move: Yes 62% ▲12.4 pts · Will …?" */
export function moverLabel(m: Market): string {
  const pct = yesPct(m)
  const mv = moveStr(m)
  return clampItem(
    `Biggest move: ${pct === null ? '' : `Yes ${pct}% `}${mv.replace(' today', '')} · ${m.question}`,
  )
}

// --- Paper positions (paper trading on live odds) ---------------------------------
// The field's dominant write action (see COMPETITORS.md) is paper trading;
// Glance's version stays inside the money-safety rules: a fixed $100 paper
// stake per position, priced off the LIVE odds, marked to market on every
// render, settled only on paper. No wallet, no keys, no real funds — the
// position is a localStorage record and arithmetic.

export const PAPER_STAKE = 100

export interface PaperPos {
  side: 'yes' | 'no'
  entry: number // entry price as a fraction (0..1) of the chosen side
  stake: number // paper dollars
}

const fmtMoney = (n: number): string =>
  `${n < 0 ? '-$' : '$'}${Math.abs(n).toFixed(2)}`
const fmtSignedMoney = (n: number): string =>
  `${n < 0 ? '-$' : '+$'}${Math.abs(n).toFixed(2)}`

/** Current paper value of a position in market `m` (null if unpriceable). */
export function paperValue(pos: PaperPos, m: Market): number | null {
  const frac = Number(m.prices?.[pos.side === 'yes' ? 0 : 1])
  if (!Number.isFinite(frac) || pos.entry <= 0) return null
  // Shares bought = stake / entry; value = shares × current fraction.
  return (pos.stake / pos.entry) * frac
}

/** Detail line: "Paper YES $100.00 @38% → $131.58 (+$31.58)". */
export function paperLine(pos: PaperPos, m: Market): string {
  const value = paperValue(pos, m)
  const head = `Paper ${pos.side.toUpperCase()} ${fmtMoney(pos.stake)} @${Math.round(pos.entry * 100)}%`
  if (value === null) return `${head} → —`
  return `${head} → ${fmtMoney(value)} (${fmtSignedMoney(value - pos.stake)})`
}

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
    lines.push(
      `SOL ${fmtSpotCompact(spot.sol.price)} ${changeStr(spot.sol.change24h)} · ` +
        `DOGE ${fmtSpotCompact(spot.doge.price)} ${changeStr(spot.doge.change24h)} · ` +
        `XRP ${fmtSpotCompact(spot.xrp.price)} ${changeStr(spot.xrp.change24h)}`,
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
