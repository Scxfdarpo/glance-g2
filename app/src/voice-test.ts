// Voice pipeline verification page — DEV ONLY, not part of the build.
//
// Why this exists: the Even Hub simulator has no microphone (verified
// Day 2 and again Day 6 — bridge.audioControl(true) returns false and
// zero audioEvent frames arrive), so the app's record step cannot be
// exercised in the simulator. This page verifies everything downstream
// of the microphone through the app's EXACT code path: it fetches a
// recorded spoken command (raw PCM, s16le, 16 kHz, mono — the SDK
// frame format, concatenated exactly as the app concatenates frames)
// from the proxy's /voice-samples route, then calls the shared
// transcribePcm() from src/voice.ts, which POSTs the bytes to the
// proxy's /stt endpoint; the local Whisper service transcribes and
// parses the intent, and this page renders each pipeline state on the
// glasses display so it can be framebuffer-verified:
//
//   READY -> FEEDING (the clip plays the role of the mic)
//         -> PROCESSING -> RESULT (transcript + intent + the action
//            the app would now execute, via the shared actionLabel()).
//
// What this does NOT verify: real-microphone capture on hardware.
// That boundary is stated in the README and the BUIDL, unchanged.
//
// Usage: http://localhost:5173/voice-test.html?cmd=cmd4_watch_bitcoin

import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
} from '@evenrealities/even_hub_sdk'
import { PROXY_BASE_URL } from './config'
import { transcribePcm, actionLabel } from './voice'

const cmd = new URLSearchParams(location.search).get('cmd') ?? 'cmd1_bitcoin_price'
const bridge = await waitForEvenAppBridge()
let started = false

function text(id: number, name: string, y: number, h: number, content: string) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: y, width: 576, height: h,
    borderWidth: 0, borderColor: 5, paddingLength: 4,
    containerID: id, containerName: name, content, isEventCapture: 0,
  })
}

async function show(body: string) {
  const containers = {
    textObject: [text(1, 'header', 0, 40, 'GLANCE · VOICE TEST'), text(2, 'body', 40, 248, body)],
    listObject: [],
  }
  if (!started) {
    await bridge.createStartUpPageContainer(
      new CreateStartUpPageContainer({ containerTotalNum: 2, ...containers }),
    )
    started = true
  } else {
    await bridge.rebuildPageContainer(
      new RebuildPageContainer({ containerTotalNum: 2, ...containers }),
    )
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let step = 'sample fetch'
try {
  const res = await fetch(`${PROXY_BASE_URL}/voice-samples/${cmd}.pcm`)
  if (!res.ok) throw new Error(`sample fetch ${res.status}`)
  const pcm = new Uint8Array(await res.arrayBuffer())
  step = 'transcribe'
  const seconds = pcm.length / 2 / 16000

  await show(
    'VOICE PIPELINE TEST\n' +
      `clip: ${cmd}\n` +
      `${pcm.length} bytes of speech (${seconds.toFixed(1)}s),\na recorded command.\n\n` +
      "Feeding it through the app's\nvoice path — the clip plays\nthe role of the microphone.",
  )
  await sleep(1500)

  await show(
    'FEEDING AUDIO (test double)\n' +
      `${pcm.length} bytes · 16 kHz PCM,\ns16le, mono — the SDK frame\nformat, concatenated as the\napp concatenates frames.`,
  )
  await sleep(Math.max(800, seconds * 1000))

  await show('PROCESSING\nPOST /stt → the proxy forwards\nthe bytes to the local Whisper\nservice. Transcribing…')
  const r = await transcribePcm(pcm)

  await show(
    `RESULT\nHeard: "${r.transcript}"\n` +
      `intent: ${r.intent}${r.coin ? ` · coin: ${r.coin}` : ''}${r.query ? ` · query: "${r.query}"` : ''}\n\n` +
      `→ the app would now:\n${actionLabel(r)}\n\n(server transcribed in ${r.ms} ms)`,
  )
} catch (err) {
  await show(
    `ERROR at step: ${step}\n${err instanceof Error ? err.message : String(err)}\n\n` +
      `url base: ${PROXY_BASE_URL}\n\nIs the proxy (npm run proxy)\nand the STT service\n(npm run stt) both running?`,
  )
}
