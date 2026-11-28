#!/usr/bin/env python3
"""Benchmark whisper models on the Glance command clips (raw PCM in)."""
import sys, time, glob, os
import numpy as np
from faster_whisper import WhisperModel

SAMPLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'samples')
EXPECTED = {
    'cmd1_bitcoin_price': 'bitcoin price',
    'cmd2_show_markets': 'show markets',
    'cmd3_morning_brief': 'morning brief',
    'cmd4_watch_bitcoin': 'watch bitcoin',
    'cmd5_latest_news': 'latest news',
    'cmd6_top_market': 'top market',
    'cmd7_ethereum_price': 'what is the ethereum price',
}
PROMPT = ('Glance voice commands: bitcoin price, ethereum price, solana price, '
          'show markets, top market, morning brief, latest news, digest, '
          'watch bitcoin, perps, funding rates.')

def load_pcm(path):
    raw = np.fromfile(path, dtype=np.int16)
    return raw.astype(np.float32) / 32768.0

for name in sys.argv[1:]:
    t0 = time.time()
    model = WhisperModel(name, device='cpu', compute_type='int8', cpu_threads=4)
    print(f'[{name}] model loaded in {time.time()-t0:.1f}s')
    for path in sorted(glob.glob(os.path.join(SAMPLES, '*.pcm'))):
        key = os.path.basename(path)[:-4]
        audio = load_pcm(path)
        t0 = time.time()
        segs, info = model.transcribe(audio, language='en', beam_size=5,
                                      vad_filter=True, initial_prompt=PROMPT)
        text = ''.join(s.text for s in segs).strip()
        dt = time.time() - t0
        ok = 'OK ' if text.lower().strip(' .') == EXPECTED[key] else 'DIFF'
        print(f'  {ok} {key}: "{text}" ({dt:.2f}s, audio {len(audio)/16000:.1f}s)')
    del model
