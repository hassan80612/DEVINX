"""Fallback registered before outcome evaluation, due to archive timeouts.

The originally registered six windows could not be assembled. Use the only
complete newly downloaded consecutive hour blocks, without inspecting their
entry outcomes: 2020-03-31 17/18 UTC, evaluated 18:29..18:59 UTC. Keep the
available 89+ minute history; do not invent missing older candles.
"""
import base64
import datetime as dt
import hashlib
import json
import lzma
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / 'research-data' / 'official-dukascopy-20261018'
ARCHIVES = ROOT / 'tests/fixtures/external/official-cache'
ARCHIVES.mkdir(parents=True, exist_ok=True)

def decode(name):
    raw_path = CACHE / (name + '.bi5')
    encoded_path = ARCHIVES / (name + '.bi5.base64')
    raw = raw_path.read_bytes() if raw_path.exists() else base64.b64decode(encoded_path.read_text())
    decoded = lzma.decompress(raw)
    assert len(decoded) % 20 == 0
    base = int(dt.datetime.strptime(name, '%Y-%m-%d-%H').replace(tzinfo=dt.timezone.utc).timestamp() * 1000)
    rows = []
    for ms, ask, bid, av, bv in struct.iter_unpack('>IIIff', decoded):
        assert 0 <= ms < 3600000 and ask >= bid > 0
        rows.append({'ts': base+ms, 'price': bid/100000, 'ask': ask/100000, 'receivedAt': base+ms})
    encoded_path.write_text(base64.b64encode(raw).decode() + '\n')
    return rows, {'archive': name, 'url': 'https://datafeed.dukascopy.com/datafeed/EURUSD/' +
                  dt.datetime.strptime(name, '%Y-%m-%d-%H').strftime('%Y/') +
                  f'{dt.datetime.strptime(name, "%Y-%m-%d-%H").month-1:02d}/' +
                  dt.datetime.strptime(name, '%Y-%m-%d-%H').strftime('%d/%Hh_ticks.bi5'),
                  'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'ticks': len(rows)}

reference, reference_meta = decode('2020-03-30-12')
old_bytes = (ROOT.parent / 'research-data/dukascopy-eurusd-example.json').read_bytes()
assert hashlib.sha256(old_bytes).hexdigest() == 'df4c6d7b089c46b73545eb5e9a5207c1ee40ce7375aaa5ba318d1f7963670403'
old = {q['timestamp']: q for q in json.loads(old_bytes)}
matched = 0
for q in reference:
    expected = old.get(q['ts'])
    if expected:
        assert abs(q['price']-expected['bidPrice']) < 1e-10 and abs(q['ask']-expected['askPrice']) < 1e-10
        matched += 1
assert matched == len(reference) == 10124

source, archives = [], []
for name in ['2020-03-31-17', '2020-03-31-18']:
    rows, meta = decode(name)
    source.extend(rows)
    archives.append(meta)
source.sort(key=lambda q: q['ts'])
quotes = list({q['ts']: {'ts': q['ts'], 'price': q['price'], 'receivedAt': q['receivedAt']} for q in source}.values())
start = int(dt.datetime(2020, 3, 31, 18, 29, tzinfo=dt.timezone.utc).timestamp()*1000)
end = start+1800000
minutes, targets = {}, {}
for q in quotes:
    minute = q['ts']//60000*60000
    if minute not in minutes:
        minutes[minute] = {'from': minute/1000, 'to': minute/1000+60,
                          'open': q['price'], 'close': q['price'], 'high': q['price'],
                          'low': q['price'], 'receivedAt': minute+60000}
    c = minutes[minute]
    c['close'], c['high'], c['low'] = q['price'], max(c['high'], q['price']), min(c['low'], q['price'])
    if start <= q['ts'] <= end:
        targets[q['ts']//1000] = q
name = 'available-official-2020-03-31-1829-utc'
metadata = {'kind': 'external-market-replay-not-user-session', 'name': name,
            'source': 'Dukascopy official EURUSD hourly BI5 tick archives', 'priceSide': 'bid',
            'from': '2020-03-31T18:29:00Z', 'to': '2020-03-31T18:59:00Z',
            'expiryQuotePolicy': 'asof-complete-bid-stream',
            'limitations': ['External Forex, not broker OTC or user session.',
                           'Fallback validation window selected from complete available downloaded blocks before running outcomes; original six-window plan not completed.',
                           '89 closed 1m bars available at start, not 100; OHLC aggregated from ticks.',
                           'Source timestamps model receive times; live latency and broker orders not modeled.']}
data = {'asset': 'EUR/USD', 'metadata': metadata, 'quotes': quotes,
        'targets': list(targets.values()), 'candles': [c for c in minutes.values() if c['to']*1000 <= end]}
assert quotes[-1]['ts'] > end+30000 and data['targets']
encoded = (json.dumps(data, separators=(',', ':'))+'\n').encode()
(ROOT / 'tests/fixtures/external' / ('dukascopy-eurusd-'+name+'.json')).write_bytes(encoded)
provenance = {'sourceArchives': archives, 'referenceArchive': reference_meta,
              'decoderExactMatchesToKnownSource': matched, 'metadata': metadata,
              'quotes': len(quotes), 'targets': len(data['targets']),
              'fixtureSha256': hashlib.sha256(encoded).hexdigest(),
              'initialClosedCandles': len([c for c in data['candles'] if c['to']*1000 <= start])}
(ROOT / 'reports/sentinel-available-official-provenance-20261018.json').write_text(json.dumps(provenance, indent=2)+'\n')
print(json.dumps(provenance, indent=2))
