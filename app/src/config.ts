// Glance configuration.
//
// Normal operation is deliberately proxy-first: the Glance backend proxy
// (server/proxy.mjs) handles Telegram's HTML and gives the WebView one stable,
// whitelisted origin. A build can point at a public proxy/tunnel with
// VITE_PROXY_BASE_URL; local development keeps the one-command localhost
// default. If that proxy is unreachable, the market feed tries Polymarket
// Gamma directly (see feeds.ts). Telegram still requires the proxy because
// the digest is parsed from public HTML pages.
export const PROXY_BASE_URL =
  import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:8787'

// Public Telegram channels with an open t.me/s preview (verified 2026-11-26).
// Channels without a public preview (e.g. CoinDeskNews, theblockcrypto,
// WuBlockchain) redirect to the profile page and cannot be digested this way.
export const DIGEST_CHANNELS = [
  'whale_alert_io',
  'cointelegraph',
  'WatcherGuru',
  'unfolded',
  'cryptoquant_official',
] as const

// How many rows of each feed the glance list shows.
export const MARKET_ROWS = 10
export const DIGEST_ROWS = 10
