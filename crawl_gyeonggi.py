"""Collect official Gyeonggi party notices; never erase data on failure."""
import json
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, quote
from urllib.request import Request, urlopen

BASE = 'https://www.minjookg.kr'
URL = BASE + '/sub01_news/notice.php'


class Notices(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.row = None
        self.anchor = False
        self.date = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'li':
            self.row = {'title': '', 'date': '', 'link': '', 'category': '일반'}
        if self.row is None:
            return
        if tag == 'a' and 'board_no=' in attrs.get('href', ''):
            board_id = re.search(r'board_no=(\d+)', attrs['href'])
            if not board_id:
                return
            self.row['link'] = URL + '?board_mode=view&board_no=' + board_id.group(1)
            self.anchor = True
        if tag == 'span' and 'date' in attrs.get('class', '').split():
            self.date = True

    def handle_data(self, data):
        if self.row is not None:
            if self.anchor:
                self.row['title'] += data
            if self.date:
                self.row['date'] += data

    def handle_endtag(self, tag):
        if tag == 'a':
            self.anchor = False
        if tag == 'span' and self.date:
            self.date = False
        if tag == 'li' and self.row is not None:
            row = self.row
            row['title'] = re.sub(r'\s+', ' ', row['title']).strip()
            row['date'] = row['date'].strip().replace('/', '-')
            if row['title'].startswith('공지 '):
                row['category'] = '공지'
                row['title'] = row['title'][3:].strip()
            if row['link'] and row['title'] and re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['date']):
                self.items.append(row)
            self.row = None


def parse(text):
    parser = Notices()
    parser.feed(text)
    return parser.items


def collect():
    result = {}
    for page in range(1, 5):
        url = URL + '?board_page=' + str(page)
        candidates = [url, 'https://corsproxy.io/?' + quote(url, safe=''),
                      'https://api.codetabs.com/v1/proxy?quest=' + quote(url, safe='')]
        items = []
        for candidate in candidates:
            try:
                request = Request(candidate, headers={'User-Agent': 'Mozilla/5.0'})
                with urlopen(request, timeout=25) as response:
                    raw = response.read()
                    charset = re.search(br'charset\s*=\s*["\']?([a-zA-Z0-9_-]+)', raw[:4096])
                    encoding = charset.group(1).decode('ascii') if charset else (response.headers.get_content_charset() or 'utf-8')
                    items = parse(raw.decode(encoding))
                if items:
                    break
                print('No valid notices:', candidate)
            except Exception as exc:
                print('Fetch failed:', candidate, str(exc))
        if not items:
            raise RuntimeError('Page %s failed; existing notices_data.json preserved' % page)
        for item in items:
            result[item['link']] = item
        print('Gyeonggi page', page, ':', len(items), 'notices')
    return sorted(result.values(), key=lambda item: item['date'], reverse=True)


if __name__ == '__main__':
    items = collect()
    output = Path(__file__).with_name('notices_data.json')
    temporary = output.with_suffix('.json.tmp')
    temporary.write_text(json.dumps({'updated': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
                                     'items': items}, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(output)
    print('Saved', len(items), 'Gyeonggi notices')
