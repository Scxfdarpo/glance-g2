#!/usr/bin/env python3
"""End-to-end test of the Glance voice pipeline over HTTP.

Feeds each spoken-command clip (raw PCM s16le 16kHz mono — the exact
bytes the G2 app accumulates from SDK audioEvent frames) to the STT
service the same way the app does (POST /stt via the proxy on :8787,
or directly to the STT service on :8788 with --direct), and checks the
transcript and parsed intent against expectations.
"""
import glob
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'http://127.0.0.1:8788' if '--direct' in sys.argv else 'http://127.0.0.1:8787'

EXPECTED = {
    'cmd1_bitcoin_price': ('bitcoin price', 'price', 'BTC'),
    'cmd2_show_markets': ('show markets', 'markets', None),
    'cmd3_morning_brief': ('morning brief', 'brief', None),
    'cmd4_watch_bitcoin': ('watch bitcoin', 'watch', 'BTC'),
    'cmd5_latest_news': ('latest news', 'digest', None),
    'cmd6_top_market': ('top market', 'top_market', None),
    'cmd7_ethereum_price': ('what is the ethereum price', 'price', 'ETH'),
}

fails = 0
for path in sorted(glob.glob(os.path.join(HERE, 'samples', '*.pcm'))):
    key = os.path.basename(path)[:-4]
    want_text, want_intent, want_coin = EXPECTED[key]
    with open(path, 'rb') as f:
        body = f.read()
    req = urllib.request.Request(
        f'{BASE}/stt', data=body, method='POST',
        headers={'content-type': 'application/octet-stream'})
    with urllib.request.urlopen(req, timeout=60) as res:
        out = json.loads(res.read())
    got_text = out['transcript'].lower().strip(' .?')
    ok = (got_text == want_text and out['intent'] == want_intent
          and out.get('coin') == want_coin)
    if not ok:
        fails += 1
    print(f"{'PASS' if ok else 'FAIL'} {key}: \"{out['transcript']}\" "
          f"intent={out['intent']} coin={out.get('coin')} "
          f"query=\"{out.get('query', '')}\" ({out['ms']} ms)")
print(f'\n{len(EXPECTED) - fails}/{len(EXPECTED)} passed via {BASE}/stt')
sys.exit(1 if fails else 0)
