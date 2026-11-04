#!/usr/bin/env python3
"""Best-effort local cache of verified Wikimedia Commons SVG links at Pages build time.

Uses only the Python standard library. Downloaded files appear only in the deployed Pages
artifact, not in the source branch. If Commons rejects a request, that card continues
using its verified external link with a neutral pictogram fallback on errors.
"""
from __future__ import annotations
import html
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = ROOT / 'znaky/index.html'
OUTPUT = ROOT / 'assets/signs'
HTML = PAGE.read_text(encoding='utf-8')
OUTPUT.mkdir(parents=True, exist_ok=True)
PATTERN = re.compile(r'<article\s+class="signcard[^>]*data-id="sign-([^\"]+)"[^>]*>.*?</article>', re.S)
SRC = re.compile(r'<img\s+src="(https://commons\.wikimedia\.org/wiki/Special:FilePath/[^\"]+\.svg)"')
HEADERS = {
    'User-Agent': 'Autoskola-HR-UA-education/1.0 (noncommercial signage reference; Wikimedia Commons attribution in each card)',
    'Accept': 'image/svg+xml,image/*;q=0.8,*/*;q=0.5',
}

ok, missed, seen = 0, [], set()

def get_svg(url: str) -> bytes | None:
    for attempt in range(3):
        try:
            req = urllib.request.Request(html.unescape(url), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=18) as response:
                content = response.read(1200000)
            # Accept only genuine SVG XML, not HTTP error/HTML page bodies.
            prefix = content[:2000].lower()
            if b'<svg' in prefix and b'</svg' in content[-4000:].lower() and len(content) < 1200000:
                return content
            return None
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            if attempt == 2:
                print('Warning:', type(e).__name__, url, flush=True)
            time.sleep(0.8 * (attempt + 1))
    return None


def replace_card(match):
    global ok
    body = match.group(0)
    code = match.group(1)
    src = SRC.search(body)
    if not src or code in seen or not re.fullmatch(r'[A-Z]\d{2,3}(?:-\d+)?', code):
        return body
    seen.add(code)
    asset = OUTPUT / f'{code}.svg'
    content = get_svg(src.group(1))
    if content:
        asset.write_bytes(content)
        body = body.replace(src.group(1), '../assets/signs/' + code + '.svg', 1)
        ok += 1
    else:
        missed.append(code)
    # Be courteous to the public Commons infrastructure.
    time.sleep(0.16)
    return body

HTML = PATTERN.sub(replace_card, HTML)
PAGE.write_text(HTML, encoding='utf-8')
print(f'Local Wikimedia SVG assets: {ok}; using remote source for {len(missed)} cards.', flush=True)
if missed:
    print('Remote fallback:', ', '.join(missed), flush=True)
