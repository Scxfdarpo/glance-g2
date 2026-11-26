# Competitor audit — Heads Up: Even Realities Hackathon

Compiled 2026-11-26 (Day 5), read-only web research.

**Method & caveat.** The DoraHacks build list
(https://dorahacks.io/hackathon/even-realities/build) is behind an AWS WAF
human-verification wall for automated reads (HTTP 405 / captcha on every
route tried), so this catalog is built from the next-best public source:
the rules require every entry to ship a **public repo**, and ~85 GitHub
repos self-describe as Heads Up entries. Repos were catalogued via the
GitHub search API and the strongest ones read in full (README level).
hackathonradar estimates **45 projects / 502 participants**. Not every
repo found is necessarily a submitted BUIDL, and late submissions may
still appear before the Nov 30 03:59 CST deadline — but the shape of the
field is clear. Our entry: **Glance**
([BUIDL](https://dorahacks.io/build/51961) ·
[repo](https://github.com/Scxfdarpo/glance-g2)) — Polymarket crypto odds
+ 5-channel Telegram digest, Tracks 02 + 01.

---

## The catalog (grouped by collision distance to Glance)

### Direct collisions — Polymarket and/or Telegram digest

| Entry | Track(s) | Concept in one line | Depth signals |
| --- | --- | --- | --- |
| **GlanceWire** ([repo](https://github.com/Boliny25-crypto/glancewire-g2)) | 01 + 02 + Best Telegram | Telegram wire + Polymarket odds, near-identical thesis to Glance | Real data both feeds (same t.me/s server-side trick, WatcherGuru/Cointelegraph defaults); **paper positions with a PAPER BOOK tracking P&L**; saved posts persist; voice-command hooks (BYO STT) |
| **PolyGlance** ([repo](https://github.com/ilham270207/polyglance)) | 02 | Prices + Polymarket + paper portfolio + alerts, iterated to v7 | CoinGecko ticker; top-3 Polymarket odds; **paper BTC/ETH portfolio with P&L**; price alerts **and odds-crossing alerts**; **working voice commands via Groq Whisper**; Telegram bot alerts that fire while the app is closed |
| **HeadsUp Markets** ([repo](https://github.com/wellyparker/headsup-markets)) | 02 + Best Telegram aim | Watched Polymarket markets + CoinGecko + paper bets + Telegram digest bot | One-tap paper bets recorded in a **backend ledger** with mark-to-market P&L echoed into a Telegram daily digest; live price alerts; headless simulator tests; degrades to **[MOCK] fixtures** when the backend is down |
| **EvenPulse** ([repo](https://github.com/LoganZ2/evenpulse-g2)) | 02 | Polymarket + Hyperliquid read/write HUD | **Image-rendered 24h sparklines** (`updateImageRawData` — sidesteps the font-glyph problem); YES/NO split bars; funding rates; **$10k paper desk**, long-press writes, voice commands; `.ehpk` in repo + live browser preview |
| **GlanceFi G2** ([repo](https://github.com/devbox-zero-ops/glancefi-g2)) | 02 | Hyperliquid mids + Polymarket + USDT wallet HUD | Read-only Arbitrum USDT balance; 1-tap paper intent with local SHA-256 receipt; **`.ehpk` release + live web HUD preview**; unit tests; Polymarket depth is thin (top market only) |
| **Heads Up News** ([repo](https://github.com/0xcuy/sieralabs-headsup-news)) | 01 + Best Telegram | AI-written news digest on glasses + Telegram bot | Backend AI agent (GLM) rewrites RSS into ≤10-word headlines every 30 min; **real voice commands via Deepgram STT**; two-way Telegram bot (save stories from glasses, `/digest` in chat) |
| **GlanceMarkets** ([repo](https://github.com/receh0910/glancemarkets)) | 02 | Polymarket crypto cards + CoinGecko spot, one card at a time | Real Gamma data, 30 s refresh, star/unstar; no write actions beyond starring; built-in fallback set for first paint |
| HeadsUp Market ([repo](https://github.com/zhengjiaming01622/headsup-market)) | 02 | Glanceable crypto ticker | Prices only, no odds depth seen |
| Odds & Coins ([repo](https://github.com/yayass-crypto/odds-coins)) | 02 | Crypto prices vs Polymarket crowd odds | Read-only comparison concept |
| Glance Markets ([repo](https://github.com/NathaniaQuentin/glance-markets)) | 02 | Live prices + Polymarket odds, read-only, no keys | Read-only |
| Heads-Up Markets ([repo](https://github.com/lembang78/even-realities-heads-up)) | 02 | Crypto & DeFi companion | — |
| GlanceMarkets ([repo](https://github.com/receh0910/glancemarkets)) | 02 | (see above) | — |
| EvenPulse, GlanceFi — see above | | | |

### Track 02 — the Hyperliquid/paper-trading swarm

Hyperliquid is the single most popular integration in the field:
[HyperLens](https://github.com/bayusd/hyperlens) (perps + wallet watch),
[HL Paper Trader](https://github.com/segoku916/hl-paper-trader) (voice
paper trading), [STRIKE](https://github.com/siyaind/strike) (visual
trading instrument), [PerpGuard](https://github.com/JahanzaibMohsin9/perpguard)
and [PerpGuard](https://github.com/tidelit4/perpguard) (two separate
liquidation guards), [PerpGlance](https://github.com/DimasFrR/perpglance)
(liquidation distance), [Riskavue](https://github.com/dimka90/riskavue)
(prop-firm rule enforcement), [GlanceTrade](https://github.com/darendrarp/glance-trade-g2),
[CryptoGlance](https://github.com/zynthlabsio/cryptoglance-even-realities)
(prices + alerts + paper trading),
[GlancePx](https://github.com/w1nter625/glancepx) (ticker + paper price
alerts), [GlanceFi](https://github.com/naplex666/glancefi-g2) (HL paper
trading), [TickGlance](https://github.com/Lexa499/tickglance) (Binance
watchlist + alerts), [Binance Glance](https://github.com/Ariqbagus/binance-glance),
[Cover Me](https://github.com/coo001/cover-me-g2) (Binance testnet
holdings), [Binance Session](https://github.com/HeyRdzy/binance-session-g2)
(voice-first, read-only), [ChainVision](https://github.com/ss251/chainvision)
(one-stop crypto), [LensFi](https://github.com/dikaandrean69/lensfi)
(DeFi companion), [HeadsUp Pay](https://github.com/jozzy001mail/headsup-pay)
(agent-payment alerts), [Heads-Up Receipts](https://github.com/GHEA12/heads-up-receipts)
(agent verification receipts), [Threadlock](https://github.com/developer-yasir/Threadlock-G2)
(deal-terms drift HUD).

### Track 01 — the Telegram digest/reply swarm (even more crowded)

The digest + AI-draft-reply pattern repeats at least a dozen times:
[TeleGlance](https://github.com/masboyalexandria/teleglance) (digest +
one-tap approved replies),
[HeadsUp Inbox](https://github.com/masboyalexandria/headsup-inbox)
(digest + draft-reply),
[TG Glance](https://github.com/Klowor2002/tg-glance) and
[TG Glance](https://github.com/Gemmahadi/tg-glance) (AI-drafted replies),
[GlanceGram](https://github.com/jpmax2027/glancegram) (digest + AI reply
drafts), [Glimpse](https://github.com/yourmememachine/glimpse) (digest +
reply), [G2 Digest](https://github.com/zdoo8866-design/headsup-g2-digest)
(digest + drafted replies),
[Telegram Inbox](https://github.com/taufik52/even-telegram-inbox)
(inbox + digest + AI triage),
[heads-up-telegram](https://github.com/DeusAcc/heads-up-telegram) (group
digests, one-tap + voice AI replies),
[Peek Pigeon](https://github.com/inunanba/peek-pigeon) (glance → choose →
confirm → reply), [PaperPlane](https://github.com/pedieth/paperplane)
(Telegram on the lens, voice reply),
[VoiceLens](https://github.com/parthpawar1117/voicelens) (voice notes
read + replied in kind),
[TeleGlance](https://github.com/buahrasa01-hub/teleglance) (HUD + AI
reply drafting), [Telegram Glance](https://github.com/alkahfiarbi/even-telegram-glance)
(unread chats + channel digests),
[telegram-glance-g2](https://github.com/aprtama929-sudo/telegram-glance-g2)
(priority messages + quick replies),
[EvenRealitiesTelegram](https://github.com/hudbeard/EvenRealitiesTelegram),
[PinGuard](https://github.com/GGGODLIN/even-pinguard) (multi-group
broadcast + silent-pin), [Floorhand](https://github.com/DmitriyTopka/floorhand)
(shop customer replies), [Recall](https://github.com/Antxnrx/recall)
(spatial social memory + Telegram),
[Glance](https://github.com/Ipan8/g2-glance) (digest + voice reply —
name collision), [Glance](https://github.com/skydrop1711-collab/glance)
(digest & drafts — name collision),
[Glance](https://github.com/dunoil/glance) ("your Telegram, answered" —
name collision),
[Glance Reply](https://github.com/agusher21/glance-reply-even-realities)
(AI-drafted replies),
[Glancefolio](https://github.com/gmxbtt/glancefolio) (portfolio + alerts
with Telegram bot delivery),
[Heads-Up Digest](https://github.com/nocteaquilaeking/heads-up-digest)
(Telegram highlights + crypto watchlist),
[headsup-telegram-glance-g2](https://github.com/Tiannuryadins/headsup-telegram-glance-g2)
(Telegram + crypto prices),
[glance-g2](https://github.com/sauceshib-cyber/glance-g2) (crypto &
Telegram assistant — repo-name collision with ours).

### Tracks 03 / 04 and the rest

Track 04 has its own cluster (AI briefings, Notion, inbox triage):
[Questling](https://github.com/plilian/questling-even-realities),
[Glance Brief](https://github.com/Khazmi-lab/glance-brief),
[GlanceNotes](https://github.com/jinan86/even-realities-glancenotes),
[Kept](https://github.com/kangmochi/Kept) (spoken promises → Notion),
[Nod](https://github.com/Class-now/nod-g2) (one-email reply),
[Inbox 30](https://github.com/tegar07257/inbox30),
[GlanceAI](https://github.com/lala1224488686/glanceai),
[Debrief](https://github.com/Taewoo-Won/glance-debrief),
[Dani](https://github.com/somdipto/dani-g2),
[SayCAD](https://github.com/c
...[truncated 7374 chars]