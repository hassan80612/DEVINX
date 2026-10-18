"""Download registered EURUSD validation windows from official tick archives.

BI5 record decoding is checked against the previously hash-verified JSON
source for an available 2020-03-30 reference hour (08 or 12 UTC) before any
new validation fixture is written.
No interpolation, model execution or outcome inspection is performed here.
"""
import concurrent.futures
import datetime as dt
import hashlib
import json
import lzma
import pathlib
import struct
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'research-data' / 'official-dukascopy-20261018'
CACHE.mkdir(parents=True, exist_ok=True)
UTC = dt.timezone.utc
WINDOWS = [(day, hour) for day in ['2020-03-31', '2020-04-01'] for hour in [8, 14, 19]]

def fetch_hour(hour):
    url = ('https://datafeed.dukascopy.com/datafeed/EURUSD/'
           f'{hour.year}/{hour.month-1:02d}/{hour.day:02d}/{hour.hour:02d}h_ticks.bi5')
    path = CACHE / (hour.strftime('%Y-%m-%d-%H') + '.bi5')
    if not path.exists():
        error = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=15) as response:
                    raw = response.read()
                error = None
                break
            except (urllib.error.URLError, TimeoutError) as exc:
                error = exc
        if error is not None:
            raise error
        lzma.decompress(raw)  # Validate before storing downloaded bytes.
        path.write_bytes(raw)
    raw = path.read_bytes()
    decoded = lzma.decompress(raw)
    if len(decoded) % 20:
        raise ValueError('Invalid BI5 record boundary')
    base = int(hour.timestamp() * 1000)
    rows = []
    for ms, ask, bid, ask_volume, bid_volume in struct.iter_unpack('>IIIff', decoded):
        if not (0 <= ms < 3600000 and ask >= bid > 0):
            raise ValueError('Invalid official tick')
        rows.append({'ts': base + ms, 'price': bid / 100000,
                     'ask': ask / 100000, 'receivedAt': base + ms})
    return hour, rows, {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(),
                        'bytes': len(raw), 'decodedTicks': len(rows)}

reference_error = None
for reference_hour in [8, 12]:
    try:
        _, reference_rows, reference_meta = fetch_hour(dt.datetime(2020, 3, 30, reference_hour, tzinfo=UTC))
        reference_error = None
        break
    except (urllib.error.URLError, TimeoutError) as exc:
        reference_error = exc
if reference_error is not None:
    raise reference_error
old_bytes = (ROOT.parent / 'research-data' / 'dukascopy-eurusd-example.json').read_bytes()
assert hashlib.sha256(old_bytes).hexdigest() == 'df4c6d7b089c46b73545eb5e9a5207c1ee40ce7375aaa5ba318d1f7963670403'
old = {q['timestamp']: q for q in json.loads(old_bytes)}
matched = 0
for row in reference_rows:
    if row['ts'] not in old:
        continue
    expected = old[row['ts']]
    assert abs(row['price'] - expected['bidPrice']) < 1e-10
    assert abs(row['ask'] - expected['askPrice']) < 1e-10
    matched += 1
assert matched > 1000, 'Insufficient archive-decoder cross-check'

hours = set()
for day, hour in WINDOWS:
    start = dt.datetime.fromisoformat(day).replace(hour=hour, tzinfo=UTC)
    first_hour = (start - dt.timedelta(minutes=105)).replace(minute=0)
    while first_hour <= start:
        hours.add(first_hour)
        first_hour += dt.timedelta(hours=1)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
    fetched = dict((hour, (rows, meta)) for hour, rows, meta in executor.map(fetch_hour, sorted(hours)))

provenance = {'source': 'Dukascopy official EURUSD hourly BI5 tick archives',
              'instrument': 'EUR/USD', 'priceSide': 'bid',
              'decoderCrossCheck': {'referenceArchive': reference_meta, 'matchingTicks': matched,
                                   'sourceJsonSha256': hashlib.sha256(old_bytes).hexdigest()},
              'windowsRegisteredBeforeEvaluation': WINDOWS,
              'archives': [meta for _, meta in fetched.values()], 'windows': []}
for day, hour in WINDOWS:
    start = dt.datetime.fromisoformat(day).replace(hour=hour, tzinfo=UTC)
    at = int(start.timestamp() * 1000)
    end = at + 1800000
    raw = [q for rows, _ in fetched.values() for q in rows if at - 6300000 <= q['ts'] <= end + 31000]
    by_time = {q['ts']: {'ts': q['ts'], 'price': q['price'], 'receivedAt': q['receivedAt']}
               for q in sorted(raw, key=lambda q: q['ts'])}
    quotes = list(by_time.values())
    minutes, buckets = {}, {}
    for q in quotes:
        minute = q['ts'] // 60000 * 60000
        if minute not in minutes:
            minutes[minute] = {'from': minute / 1000, 'to': minute / 1000 + 60,
                               'open': q['price'], 'close': q['price'], 'high': q['price'],
                               'low': q['price'], 'receivedAt': minute + 60000}
        c = minutes[minute]
        c['close'] = q['price']
        c['high'] = max(c['high'], q['price'])
        c['low'] = min(c['low'], q['price'])
        if at <= q['ts'] <= end:
            buckets[q['ts'] // 1000] = q
    name = f'official-{day}-{hour:02d}-utc'
    meta = {'name': name, 'kind': 'external-market-replay-not-user-session',
            'source': provenance['source'], 'date': day, 'instrument': 'EUR/USD', 'priceSide': 'bid',
            'from': start.isoformat(), 'to': (start + dt.timedelta(minutes=30)).isoformat(),
            'expiryQuotePolicy': 'asof-complete-bid-stream',
            'limitations': ['External Forex, not broker OTC or user session.',
                            '1m OHLC aggregated from observed ticks, not native broker candles.',
                            'Receive times equal historical source timestamps; live transport/click delay not modeled.']}
    data = {'asset': 'EUR/USD', 'metadata': meta, 'quotes': quotes,
            'targets': list(buckets.values()),
            'candles': [c for c in minutes.values() if at - 6000000 <= c['to'] * 1000 <= end]}
    assert quotes[0]['ts'] <= at - 6000000 and quotes[-1]['ts'] >= end + 30000
    assert len(data['targets']) > 1200 and len(data['candles']) >= 120
    path = ROOT / 'tests' / 'fixtures' / 'external' / f'dukascopy-eurusd-{name}.json'
    encoded = (json.dumps(data, separators=(',', ':')) + '\n').encode()
    path.write_bytes(encoded)
    stats = {'name': name, 'quoteCount': len(quotes), 'targetCount': len(data['targets']),
             'candleCount': len(data['candles']), 'fixtureSha256': hashlib.sha256(encoded).hexdigest()}
    provenance['windows'].append(stats)
    print(json.dumps(stats), flush=True)
(ROOT / 'reports' / 'sentinel-official-ticks-provenance-20261018.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(json.dumps({'decoderMatchedTicks': matched, 'windows': len(WINDOWS)}), flush=True)
