"""Cache official notice bodies for the split preview, preserving failures."""
import json
import re
import time
from urllib.request import Request, urlopen
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

OUTPUT = Path('notice_previews.json')
EXTRACT = Path('notice-preview-extract.js').read_text(encoding='utf-8')

def run():
    cache = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {'items': {}}
    items = cache.setdefault('items', {})
    pending = []
    for filename in ['central_data.json', 'notices_data.json', 'council_data.json']:
        rows = json.loads(Path(filename).read_text(encoding='utf-8')).get('items', [])
        # Fresh/new posts first; missing previews are gradually backfilled.
        for row in rows:
            url = row.get('link', '')
            host = urlparse(url).hostname or ''
            if not host or not any(host == h or host.endswith('.' + h) for h in ['theminjoo.kr','minjookg.kr','ggc.go.kr','council.gg.go.kr']):
                continue
            old = items.get(url)
            if not old or time.time() - old.get('fetched_epoch', 0) > 86400:
                pending.append(url)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(locale='ko-KR')
        # Bound scheduled run duration and retain successful cached bodies.
        deadline = time.monotonic() + 240
        for url in pending[:36]:
            if time.monotonic() > deadline:
                break
            try:
                if 'theminjoo.kr' in urlparse(url).hostname:
                    page.goto(url, wait_until='domcontentloaded', timeout=15000)
                else:
                    with urlopen(Request(url, headers={'User-Agent':'Mozilla/5.0'}), timeout=15) as response:
                        page.set_content(re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', response.read(2 * 1024 * 1024).decode('utf-8'), flags=re.I), wait_until='domcontentloaded')
                preview = page.evaluate('(' + EXTRACT + ')(' + json.dumps(url) + ')')
                if preview:
                    items[url] = {**preview, 'fetched_epoch': time.time()}
            except Exception as exc:
                print('Preview unavailable:', url, type(exc).__name__)
        browser.close()
    cache['updated_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    OUTPUT.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Cached notice previews:', len(items))

if __name__ == '__main__':
    run()
