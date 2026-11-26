// Glance — Polymarket odds + Telegram crypto digest on G2, in one glance.
//
// Views (one page, rebuilt on navigation — rebuildPageContainer is the
// sanctioned way to change a page after startup):
//   HOME    the app's promise in one screen: BTC/ETH spot, any watch
//           alert, the top (watched) market, the latest headline, and
//           one-tap doors into both feeds and the morning brief.
//   LIST    header + feed list + footer hint. Row 0 switches feed
//           (MARKETS ⇄ DIGEST); tapping a row opens its DETAIL.
//   DETAIL  full item text + action list: watch/unwatch (markets),
//           one-line brief, back. Market detail adds the 24h price
//           trend from the CLOB history endpoint.
//   BRIEF   the item rewritten as one shareable line + back actions.
//   MORNING the whole morning on one screen: spot, top-3 markets,
//           top-2 headlines — composed on-device, ready to share.
//
// Read-and-write: the watchlist persists in localStorage and pins watched
// markets to the top with a ★; watched prices are remembered between
// refreshes and a ≥3-pt move raises an alert on the row and on HOME;
// briefs are composed on-device from live numbers (no LLM round-trip —
// the answer is there in one tap).
//
// Event routing follows the official minimal template's rules:
//   • CLICK_EVENT is 0 and protobuf omits zero fields, so an envelope's
//     eventType may be `undefined` — resolve the default INSIDE the check.
//   • Taps on the list arrive via `event.listEvent`; lifecycle via
//     `event.sysEvent`. Never mix them.
//   • Double-tap exits from the root (list) page via the system dialog;
//     on sub-pages it means "back".

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  ListContainerProperty,
  ListItemContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { MARKET_ROWS, DIGEST_ROWS } from './config'
import {
  fetchMarkets,
  fetchDigest,
  fetchSpot,
  fetchHistory,
  marketRow,
  postRow,
  marketDetailLines,
  postDetail,
  marketBrief,
  postBrief,
  spotLine,
  deltaStr,
  watchDeltaPts,
  trendStrip,
  morningBrief,
  clampItem,
  biggestMover,
  moverLabel,
  paperLine,
  PAPER_STAKE,
  type Market,
  type Post,
  type Spot,
  type HistoryPoint,
  type PaperPos,
} from './feeds'

// ---------------------------------------------------------------- state

type FeedName = 'markets' | 'digest'
type View = 'home' | 'list' | 'detail' | 'brief' | 'morning'

const state = {
  feed: 'markets' as FeedName,
  view: 'home' as View,
  markets: [] as Market[],
  posts: [] as Post[],
  spot: null as Spot | null,
  selected: 0, // index into the current feed's items (detail/brief target)
  detailFrom: 'list' as 'home' | 'list', // where DETAIL was opened from
  updatedAt: null as Date | null,
  stale: false, // last refresh failed — showing previous data
  loaded: false, // at least one feed loaded successfully, ever
  // Price history for the open market detail (null = not loaded yet).
  historySlug: null as string | null,
  history: null as HistoryPoint[] | null,
  historyFailed: false,
}

// Watchlist — persisted market slugs.
const WATCH_KEY = 'glance:watchlist:v1'
const watch = new Set<string>( (() => {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch { return [] }
})() )
function saveWatch() {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify([...watch])) } catch { /* storage unavailable */ }
}

// Last-seen Yes prices for watched markets — persisted alongside the
// watchlist so alerts survive restarts too. `alerts` holds the latest
// computed move (points, signed) per watched slug, |delta| >= 3 only.
const PRICES_KEY = 'glance:watch-prices:v1'
const lastPrices = new Map<string, number>( (() => {
  try {
    const v = JSON.parse(localStorage.getItem(PRICES_KEY) ?? '{}')
    return new Map(
      Object.entries(v).filter(([, n]) => typeof n === 'number') as [string, number][],
    )
  } catch { return new Map() }
})() )
function savePrices() {
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify(Object.fromEntries(lastPrices)))
  } catch { /* storage unavailable */ }
}
const alerts = new Map<string, number>()
const ALERT_THRESHOLD_PTS = 3

// Paper positions — persisted paper trades on live odds (Day 5). One open
// position per market, fixed $100 paper stake, marked to market from the
// live feed on every render. Paper only: no wallet, no keys, no funds.
const PAPER_KEY = 'glance:paper:v1'
const paper = new Map<string, PaperPos>( (() => {
  const out = new Map<string, PaperPos>()
  try {
    const v = JSON.parse(localStorage.getItem(PAPER_KEY) ?? '{}') as Record<string, unknown>
    for (const [slug, raw] of Object.entries(v)) {
      const p = raw as Partial<PaperPos> | null
      if (
        p && (p.side === 'yes' || p.side === 'no') &&
        typeof p.entry === 'number' && typeof p.stake === 'number'
      ) {
        out.set(slug, { side: p.side, entry: p.entry, stake: p.stake })
      }
    }
  } catch { /* corrupted storage — start empty */ }
  return out
})() )
function savePaper() {
  try {
    localStorage.setItem(PAPER_KEY, JSON.stringify(Object.fromEntries(paper)))
  } catch { /* storage unavailable */ }
}

/** The largest current watch alert, if any. */
function topAlert(): { slug: string; delta: number } | null {
  let best: { slug: string; delta: number } | null = null
  for (const [slug, delta] of alerts) {
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { slug, delta }
  }
  return best
}

/** Markets with watched ones pinned to the top (stable within each group). */
function orderedMarkets(): Market[] {
  return [...state.markets].sort(
    (a, b) => Number(watch.has(b.slug)) - Number(watch.has(a.slug)),
  )
}
function currentMarket(): Market | undefined {
  return orderedMarkets()[state.selected]
}
function currentPost(): Post | undefined {
  return state.posts[state.selected]
}

// ---------------------------------------------------------------- data

const marketSig = (ms: Market[]) => ms.map((m) => `${m.slug}:${m.prices[0]}`).join('|')
const postSig = (ps: Post[]) => ps.map((p) => p.id).join('|')
const spotSig = (s: Spot | null) => (s ? `${s.btc.price}:${s.eth.price}` : '')
const alertSig = () =>
  [...alerts.entries()].map(([k, v]) => `${k}:${v.toFixed(1)}`).sort().join('|')

/** Compare freshly fetched markets against the remembered watched prices;
 *  refresh the alert set and the remembered baselines. */
function updateAlerts(fresh: Market[]) {
  for (const m of fresh) {
    if (!watch.has(m.slug)) continue
    const prev = lastPrices.get(m.slug)
    const now = Number(m.prices?.[0])
    if (prev !== undefined) {
      const delta = watchDeltaPts(prev, m)
      if (delta !== null && Math.abs(delta) >= ALERT_THRESHOLD_PTS) alerts.set(m.slug, delta)
      else alerts.delete(m.slug)
    }
    if (Number.isFinite(now)) lastPrices.set(m.slug, now)
  }
  savePrices()
}

async function loadFeeds(): Promise<boolean> {
  const [m, p, s] = await Promise.allSettled([
    fetchMarkets(MARKET_ROWS),
    fetchDigest(DIGEST_ROWS),
    fetchSpot(),
  ])
  let changed = false
  let anyOk = false
  if (m.status === 'fulfilled') {
    anyOk = true
    const before = alertSig()
    updateAlerts(m.value)
    if (alertSig() !== before) changed = true
    if (marketSig(m.value) !== marketSig(state.markets)) { state.markets = m.value; changed = true }
  }
  if (p.status === 'fulfilled') {
    anyOk = true
    if (postSig(p.value) !== postSig(state.posts)) { state.posts = p.value; changed = true }
  }
  if (s.status === 'fulfilled') {
    anyOk = true
    if (spotSig(s.value) !== spotSig(state.spot)) { state.spot = s.value; changed = true }
  }
  state.stale = !anyOk
  if (anyOk) {
    state.loaded = true
    state.updatedAt = new Date()
  }
  return changed
}

// ---------------------------------------------------------------- rendering

const bridge = await waitForEvenAppBridge()
let started = false

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function headerContent(): string {
  const when = state.updatedAt ? ` · updated ${hhmm(state.updatedAt)}` : ''
  const stale = state.stale ? ' · STALE' : ''
  switch (state.view) {
    case 'home': return `GLANCE${when}${stale}`
    case 'detail': return state.feed === 'markets' ? 'GLANCE · MARKET' : 'GLANCE · POST'
    case 'brief': return 'GLANCE · BRIEF — ready to share'
    case 'morning': return 'GLANCE · MORNING BRIEF'
    default:
      return state.feed === 'markets'
        ? `GLANCE · MARKETS${when}${stale}`
        : `GLANCE · DIGEST${when}${stale}`
  }
}

function text(id: number, name: string, y: number, h: number, content: string, capture = 0) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: y, width: 576, height: h,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: id, containerName: name, content, isEventCapture: capture,
  })
}
function list(id: number, y: number, h: number, items: string[]) {
  return new ListContainerProperty({
    xPosition: 0, yPosition: y, width: 576, height: h,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: id, containerName: 'list',
    itemContainer: new ListItemContainerProperty({
      itemCount: items.length,
      itemWidth: 560,
      isItemSelectBorderEn: 1,
      itemName: items.map(clampItem),
    }),
    isEventCapture: 1,
  })
}

function listItems(): string[] {
  if (state.feed === 'markets') {
    const rows = orderedMarkets().map((m) => marketRow(m, watch.has(m.slug), alerts.get(m.slug)))
    return ['>> DIGEST — tap to switch feed', ...(rows.length ? rows : ['No markets — tap to retry'])]
  }
  const rows = state.posts.map((p) => postRow(p))
  return ['>> MARKETS — tap to switch feed', ...(rows.length ? rows : ['No posts — tap to retry'])]
}

// Home rows are descriptors so rendering and click handling can never
// disagree about what a row means (the alert row is conditional).
type HomeRow = { label: string; go: () => void }

function openMarket(idx: number, from: 'home' | 'list') {
  state.feed = 'markets'
  state.selected = idx
  state.detailFrom = from
  state.view = 'detail'
  void render()
}
function openPost(idx: number, from: 'home' | 'list') {
  state.feed = 'digest'
  state.selected = idx
  state.detailFrom = from
  state.view = 'detail'
  void render()
}

function homeRows(): HomeRow[] {
  const rows: HomeRow[] = []
  rows.push({
    label: state.spot ? spotLine(state.spot) : 'BTC · ETH — spot loading…',
    go: () => { state.feed = 'markets'; state.view = 'list'; void render() },
  })
  const alert = topAlert()
  if (alert) {
    const idx = orderedMarkets().findIndex((m) => m.slug === alert.slug)
    const m = idx >= 0 ? orderedMarkets()[idx] : undefined
    if (m) {
      rows.push({
        label: clampItem(
          `! ${alert.delta >= 0 ? '▲' : '▼'}${deltaStr(alert.delta)} pts · ${m.question}`,
        ),
        go: () => openMarket(idx, 'home'),
      })
    }
  }
  const top = orderedMarkets()[0]
  if (top) {
    rows.push({
      label: marketRow(top, watch.has(top.slug), alerts.get(top.slug)),
      go: () => openMarket(0, 'home'),
    })
  } else {
    rows.push({ label: 'No markets — tap to retry', go: () => { void refresh(true) } })
  }
  // Biggest 24h mover among everything fetched — "what moved most while
  // I wasn't looking". Skipped when it is the top row itself.
  const mover = biggestMover(state.markets)
  if (mover && mover.slug !== top?.slug && Math.abs(mover.oneDayPriceChange ?? 0) >= 0.01) {
    const idx = orderedMarkets().findIndex((m) => m.slug === mover.slug)
    if (idx >= 0) {
      rows.push({ label: moverLabel(mover), go: () => openMarket(idx, 'home') })
    }
  }
  const latest = state.posts[0]
  if (latest) {
    rows.push({ label: postRow(latest), go: () => openPost(0, 'home') })
  }
  rows.push({
    label: '>> MARKETS — all odds',
    go: () => { state.feed = 'markets'; state.view = 'list'; void render() },
  })
  rows.push({
    label: '>> DIGEST — the wire',
    go: () => { state.feed = 'digest'; state.view = 'list'; void render() },
  })
  rows.push({
    label: 'Morning brief — tap to compose',
    go: () => { state.view = 'morning'; void render() },
  })
  return rows
}

function footerContent(): string {
  if (!state.loaded) return 'Feeds offline — start the Glance proxy, then tap a row to retry.'
  if (state.view === 'home') {
    return `${watch.size} watching · ${paper.size} paper open · spot · top market · the wire`
  }
  if (state.feed === 'markets') {
    return `${watch.size} watching · tap a row for detail · double-tap: home`
  }
  return 'Public Telegram channels · tap a row for detail · double-tap: home'
}

function detailBody(): string {
  if (state.feed === 'markets') {
    const m = currentMarket()
    if (!m) return 'This market has closed. Back to the list for live ones.'
    // Line order is a visibility budget: the body box shows ~6 lines, so
    // the trend strip and the paper line outrank the Event line — for
    // headline markets the event title is a vaguer copy of the question
    // ("…above ___ one day after launch?" vs "…above $1B…?"), so it is
    // popped and not re-appended.
    const lines = marketDetailLines(m)
    if (m.eventTitle && m.eventTitle !== m.question) lines.pop()
    if (state.historySlug === m.slug && state.history && state.history.length >= 2) {
      const strip = trendStrip(state.history)
      if (strip) lines.push(strip)
    } else if (state.historySlug === m.slug && state.historyFailed) {
      lines.push('24h: unavailable')
    } else if (m.yesTokenId) {
      lines.push('24h: loading…')
    }
    const pos = paper.get(m.slug)
    if (pos) lines.push(paperLine(pos, m))
    const delta = alerts.get(m.slug)
    if (delta !== undefined) {
      lines.push(`Watch alert: ${delta >= 0 ? '▲' : '▼'} ${deltaStr(delta)} pts since last check`)
    }
    return lines.join('\n')
  }
  const p = currentPost()
  return p ? postDetail(p) : 'This post is gone. Back to the list for fresh ones.'
}

/** Load the open market's price history once; re-render when it lands. */
function ensureHistory() {
  if (state.view !== 'detail' || state.feed !== 'markets') return
  const m = currentMarket()
  if (!m || !m.yesTokenId || state.historySlug === m.slug) return
  state.historySlug = m.slug
  state.history = null
  state.historyFailed = false
  const slug = m.slug
  fetchHistory(m.yesTokenId)
    .then((points) => {
      if (state.historySlug !== slug) return
      state.history = points
      if (!points.length) state.historyFailed = true
      if (state.view === 'detail') void render()
    })
    .catch(() => {
      if (state.historySlug !== slug) return
      state.historyFailed = true
      if (state.view === 'detail') void render()
    })
}

type DetailAct = 'watch' | 'paperYes' | 'paperNo' | 'paperClose' | 'brief' | 'back'

/** Detail actions as descriptors (label + act together, like homeRows)
 *  so rendering and click handling can never disagree about indices. */
function detailActionRows(): { label: string; act: DetailAct }[] {
  const back: { label: string; act: DetailAct } = {
    label: state.detailFrom === 'home' ? '← Back to home' : '← Back to list',
    act: 'back',
  }
  if (state.feed !== 'markets') {
    return [{ label: 'Brief — one-line summary', act: 'brief' }, back]
  }
  const m = currentMarket()
  if (!m) return [back]
  const rows: { label: string; act: DetailAct }[] = [
    {
      label: watch.has(m.slug) ? '★ Watching — tap to unwatch' : '☆ Watch this market',
      act: 'watch',
    },
  ]
  const pos = paper.get(m.slug)
  if (pos) {
    rows.push({
      label: `Paper: close ${pos.side.toUpperCase()} — settle at live price`,
      act: 'paperClose',
    })
  } else {
    const yes = Number(m.prices?.[0])
    const no = Number(m.prices?.[1])
    if (Number.isFinite(yes) && yes > 0.001 && yes < 0.999) {
      rows.push({ label: `Paper: buy YES $${PAPER_STAKE} @ ${Math.round(yes * 100)}%`, act: 'paperYes' })
    }
    if (Number.isFinite(no) && no > 0.001 && no < 0.999) {
      rows.push({ label: `Paper: buy NO $${PAPER_STAKE} @ ${Math.round(no * 100)}%`, act: 'paperNo' })
    }
  }
  rows.push({ label: 'Brief — one-line summary', act: 'brief' }, back)
  return rows
}

function briefBody(): string {
  const line =
    state.feed === 'markets'
      ? (currentMarket() ? marketBrief(currentMarket()!) : '')
      : (currentPost() ? postBrief(currentPost()!) : '')
  return line ? `${line}\n\n— composed by Glance from live data.` : 'Nothing to brief — back to the list.'
}

async function render() {
  // If the detail target vanished in a refresh, fall back to the list.
  if (state.view === 'detail' || state.view === 'brief') {
    const exists = state.feed === 'markets' ? !!currentMarket() : !!currentPost()
    if (!exists) state.view = 'list'
  }
  ensureHistory()
  const header = text(1, 'header', 0, 40, headerContent())
  let containers: { textObject: TextContainerProperty[]; listObject: ListContainerProperty[] }
  if (state.view === 'home') {
    containers = {
      textObject: [header, text(3, 'footer', 208, 80, footerContent())],
      listObject: [list(2, 40, 168, homeRows().map((r) => r.label))],
    }
  } else if (state.view === 'list') {
    containers = {
      textObject: [header, text(3, 'footer', 208, 80, footerContent())],
      listObject: [list(2, 40, 168, listItems())],
    }
  } else if (state.view === 'detail') {
    // Day 5: the action list grew (paper open/close), so the detail view
    // trades a little body height for action height — 160/88 vs 168/80,
    // sized so six body lines (through the paper line) stay visible.
    containers = {
      textObject: [header, text(3, 'body', 40, 160, detailBody())],
      listObject: [list(2, 200, 88, detailActionRows().map((r) => r.label))],
    }
  } else if (state.view === 'morning') {
    containers = {
      textObject: [
        header,
        text(3, 'body', 40, 168, morningBrief(state.spot, orderedMarkets(), state.posts)),
      ],
      listObject: [list(2, 208, 80, ['← Back to home'])],
    }
  } else {
    containers = {
      textObject: [header, text(3, 'body', 40, 168, briefBody())],
      listObject: [list(2, 208, 80, ['← Back to detail', '← Back to list'])],
    }
  }
  const total = containers.textObject.length + containers.listObject.length
  if (!started) {
    const result = await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: total, ...containers }),
    )
    started = true
    console.log('Glance page created:', result === 0 ? 'success' : `failed (${result})`)
  } else {
    const ok = await bridge.rebuildPageContainer(
      new RebuildPageContainer({ containerTotalNum: total, ...containers }),
    )
    if (!ok) console.log('Glance rebuild failed')
  }
}

async function refreshHeader() {
  await bridge.textContainerUpgrade(
    new TextContainerUpgrade({ containerID: 1, containerName: 'header', content: headerContent() }),
  )
}

// ---------------------------------------------------------------- actions

function onListClick(idx: number) {
  if (state.view === 'home') {
    homeRows()[idx]?.go()
    return
  }
  if (state.view === 'morning') {
    state.view = 'home'
    void render()
    return
  }
  if (state.view === 'list') {
    if (idx === 0) {
      state.feed = state.feed === 'markets' ? 'digest' : 'markets'
      void render()
      return
    }
    const count = state.feed === 'markets' ? state.markets.length : state.posts.length
    if (!count) { void refresh(true); return } // retry row
    const sel = Math.min(idx - 1, count - 1)
    if (state.feed === 'markets') openMarket(sel, 'list')
    else openPost(sel, 'list')
    return
  }
  if (state.view === 'detail') {
    const act = detailActionRows()[idx]?.act
    const m = state.feed === 'markets' ? currentMarket() : undefined
    if (act === 'watch' && m) {
      if (watch.has(m.slug)) {
        watch.delete(m.slug)
        lastPrices.delete(m.slug)
        alerts.delete(m.slug)
        savePrices()
      } else {
        watch.add(m.slug)
        // Baseline = the price on screen now; alerts measure from here.
        const now = Number(m.prices?.[0])
        if (Number.isFinite(now)) { lastPrices.set(m.slug, now); savePrices() }
      }
      saveWatch()
      void render()
    } else if ((act === 'paperYes' || act === 'paperNo') && m) {
      const side = act === 'paperYes' ? 'yes' : 'no'
      const entry = Number(m.prices?.[side === 'yes' ? 0 : 1])
      if (Number.isFinite(entry) && entry > 0.001 && entry < 0.999) {
        paper.set(m.slug, { side, entry, stake: PAPER_STAKE })
        savePaper()
      }
      void render()
    } else if (act === 'paperClose' && m) {
      paper.delete(m.slug)
      savePaper()
      void render()
    } else if (act === 'brief') {
      state.view = 'brief'
      void render()
    } else if (act === 'back') {
      state.view = state.detailFrom
      void render()
    }
    return
  }
  // brief view
  state.view = idx === 0 ? 'detail' : 'list'
  void render()
}

async function refresh(manual = false) {
  const changed = await loadFeeds()
  if (changed || manual) await render()
  else if (state.view === 'list' || state.view === 'home') await refreshHeader()
}

// ---------------------------------------------------------------- boot + events

await loadFeeds()
await render()
setInterval(() => { void refresh() }, 60_000)

type Envelope = { eventType?: OsEventTypeList }
function eventTypeOf(envelope?: Envelope): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)
  const listType = eventTypeOf(event.listEvent)

  if (
    sysType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    textType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    listType === OsEventTypeList.DOUBLE_CLICK_EVENT
  ) {
    if (state.view === 'home') {
      bridge.shutDownPageContainer(1) // mode 1 = system exit dialog (required on root page)
    } else if (state.view === 'brief') {
      state.view = 'detail'
      void render()
    } else if (state.view === 'detail') {
      state.view = state.detailFrom
      void render()
    } else {
      // list and morning step back to the home glance
      state.view = 'home'
      void render()
    }
    return
  }

  if (listType === OsEventTypeList.CLICK_EVENT && event.listEvent) {
    onListClick(event.listEvent.currentSelectItemIndex ?? 0)
    return
  }

  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    unsubscribe()
  }
})
