// Voice commands for Glance — the client half of the pipeline.
//
// The G2 SDK delivers raw microphone PCM only (no speech-to-text), so
// the app accumulates the SDK's audioEvent frames and POSTs the bytes
// to the Glance proxy's /stt endpoint. The proxy forwards them,
// untouched, to a local faster-whisper service on the same machine
// (server/stt/stt_server.py) — transcription happens on our own
// hardware, with no API key and no cloud ASR. The service also parses
// the transcript into an intent; the app then executes that intent
// through the very same actions the taps use.
//
// Wire format: raw PCM, signed 16-bit little-endian, 16 kHz, mono —
// the format the SDK frames carry, concatenated in arrival order.
//
// This module is shared verbatim by the app (src/main.ts) and by the
// dev-only verification page (src/voice-test.ts), which feeds recorded
// spoken commands through this exact code path because the simulator
// has no microphone (see BUILDLOG Day 6).

import { PROXY_BASE_URL } from './config'

export type VoiceIntent =
  | 'price'
  | 'markets'
  | 'top_market'
  | 'digest'
  | 'brief'
  | 'perps'
  | 'watch'
  | 'home'
  | 'unknown'

export interface SttResult {
  transcript: string
  intent: VoiceIntent
  coin: string | null // BTC / ETH / SOL / DOGE / XRP when named
  query: string // free-text remainder (watch target)
  ms: number // server-side transcription time
}

/** POST accumulated mic PCM to the proxy's /stt endpoint. */
export async function transcribePcm(pcm: Uint8Array, timeoutMs = 30_000): Promise<SttResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${PROXY_BASE_URL}/stt`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: pcm as BodyInit,
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`stt ${res.status}`)
    const d = (await res.json()) as SttResult
    if (typeof d.transcript !== 'string' || typeof d.intent !== 'string') {
      throw new Error('stt: malformed reply')
    }
    return d
  } finally {
    clearTimeout(timer)
  }
}

/** What the app will do with a result, in one glanceable line. Used by
 *  the app's voice view and by the verification page, so both describe
 *  the dispatch identically. */
export function actionLabel(r: SttResult): string {
  switch (r.intent) {
    case 'price':
      return r.coin ? `answer with the live ${r.coin} spot price` : 'answer with the live BTC spot price'
    case 'markets':
      return 'open the markets list'
    case 'top_market':
      return 'open the top market'
    case 'digest':
      return 'open the digest (the wire)'
    case 'brief':
      return 'open the morning brief'
    case 'perps':
      return 'open the perps panel'
    case 'watch':
      return `watch the first live market matching "${r.query}" and open it`
    case 'home':
      return 'go home'
    default:
      return 'no matching command — show suggestions'
  }
}

/** The commands the voice view advertises. Kept in sync with the
 *  server-side parser (server/stt/stt_server.py). */
export const VOICE_EXAMPLES = [
  '"bitcoin price"',
  '"show markets"',
  '"top market"',
  '"watch bitcoin"',
  '"morning brief"',
  '"latest news"',
  '"perps"',
]
