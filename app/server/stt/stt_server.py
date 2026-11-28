#!/usr/bin/env python3
"""Glance STT service — local speech-to-text for voice commands.

A tiny persistent HTTP service (stdlib only) around faster-whisper.
The Glance proxy forwards raw microphone PCM here; this service
transcribes it with a LOCAL Whisper model (no API key, no cloud ASR)
and parses the transcript into one of Glance's voice intents.

Wire format (the exact bytes the G2 app accumulates from the SDK's
audioEvent frames and POSTs to the proxy's /stt endpoint):
  raw PCM, signed 16-bit little-endian, 16 kHz, mono.
A WAV body (RIFF header) is also accepted as a convenience for curl
tests; the app itself always sends raw PCM.

Endpoints:
  POST /stt              body = audio -> { transcript, intent, coin,
                                           query, ms }
  GET  /health           { ok, model }
  GET  /samples/<name>   the spoken-command test clips (dev only;
                         used by the in-simulator verification page)

Run:  GLANCE_STT_MODEL=base .venv/bin/python stt_server.py   (:8788)
"""
import io
import json
import os
import re
import sys
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, 'samples')
MODEL_NAME = os.environ.get('GLANCE_STT_MODEL', 'base')
PORT = int(os.environ.get('GLANCE_STT_PORT', '8788'))
MAX_SECONDS = 15

PROMPT = ('Glance voice commands: bitcoin price, ethereum price, solana price, '
          'dogecoin price, ripple price, show markets, top market, morning '
          'brief, latest news, digest, watch bitcoin, perps, funding rates.')

print(f'loading whisper model "{MODEL_NAME}" (int8, cpu)…', flush=True)
_t0 = time.time()
MODEL = WhisperModel(MODEL_NAME, device='cpu', compute_type='int8', cpu_threads=4)
print(f'model ready in {time.time() - _t0:.1f}s on :{PORT}', flush=True)

# --- Intent parsing -----------------------------------------------------------
# Deterministic keyword parser over the transcript. The app executes the
# returned intent against its live state (same actions as the taps).

COINS = [
    ('BTC', ('bitcoin', 'btc')),
    ('ETH', ('ethereum', 'eth')),
    ('SOL', ('solana', 'sol')),
    ('DOGE', ('dogecoin', 'doge')),
    ('XRP', ('ripple', 'xrp')),
]


def parse_intent(text):
    t = ' ' + re.sub(r'[^a-z0-9 ]', ' ', text.lower()).strip() + ' '
    coin = None
    for sym, names in COINS:
        if any(f' {n} ' in t or t.startswith(f'{n} ') for n in names):
            coin = sym
            break
    if 'watch' in t:
        # Query = the words after "watch", minus filler; the app matches
        # it against live market questions.
        q = t.split('watch', 1)[1].strip()
        q = re.sub(r'^(the|a|this|that)\s+', '', q)
        return {'intent': 'watch', 'coin': coin, 'query': q or (coin or '').lower()}
    if 'morning' in t or 'brief' in t:
        return {'intent': 'brief', 'coin': coin, 'query': ''}
    if 'digest' in t or 'news' in t or 'headline' in t or 'wire' in t:
        return {'intent': 'digest', 'coin': coin, 'query': ''}
    if 'perp' in t or 'funding' in t or 'hyperliquid' in t or 'futures' in t:
        return {'intent': 'perps', 'coin': coin, 'query': ''}
    if 'top' in t and 'market' in t:
        return {'intent': 'top_market', 'coin': coin, 'query': ''}
    if 'market' in t:
        return {'intent': 'markets', 'coin': coin, 'query': ''}
    if 'home' in t:
        return {'intent': 'home', 'coin': coin, 'query': ''}
    if coin or 'price' in t:
        return {'intent': 'price', 'coin': coin, 'query': ''}
    return {'intent': 'unknown', 'coin': coin, 'query': ''}


def pcm_to_float(body):
    """Raw s16le PCM (or a WAV container) -> float32 samples @16kHz."""
    if body[:4] == b'RIFF':
        with wave.open(io.BytesIO(body)) as w:
            if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
                raise ValueError('wav must be 16kHz mono s16')
            raw = w.readframes(w.getnframes())
    else:
        raw = body
    if len(raw) % 2:
        raw = raw[:-1]
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('content-type', 'application/json')
        self.send_header('access-control-allow-origin', '*')
        self.send_header('content-length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            return self._json(200, {'ok': True, 'model': MODEL_NAME})
        if self.path.startswith('/samples/'):
            name = os.path.basename(self.path[len('/samples/'):])
            path = os.path.join(SAMPLES, name)
            if os.path.isfile(path):
                with open(path, 'rb') as f:
                    body = f.read()
                self.send_response(200)
                self.send_header('content-type', 'application/octet-stream')
                self.send_header('access-control-allow-origin', '*')
                self.send_header('content-length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            return self._json(404, {'error': 'no such sample'})
        return self._json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path.split('?')[0] != '/stt':
            return self._json(404, {'error': 'not found'})
        try:
            length = int(self.headers.get('content-length') or 0)
            body = self.rfile.read(length) if length else b''
            if not body:
                return self._json(400, {'error': 'empty audio'})
            audio = pcm_to_float(body)
            seconds = len(audio) / 16000.0
            if seconds > MAX_SECONDS:
                return self._json(400, {'error': f'audio too long ({seconds:.1f}s > {MAX_SECONDS}s)'})
            t0 = time.time()
            segs, _info = MODEL.transcribe(
                audio, language='en', beam_size=5, vad_filter=True,
                initial_prompt=PROMPT)
            transcript = ''.join(s.text for s in segs).strip()
            ms = round((time.time() - t0) * 1000)
            out = {'transcript': transcript, 'ms': ms, 'seconds': round(seconds, 2)}
            out.update(parse_intent(transcript))
            return self._json(200, out)
        except Exception as err:  # honest error, never a fake transcript
            return self._json(502, {'error': str(err)})


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
