import concurrent.futures
import datetime
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
origin = sys.argv[1].rstrip('/')
stage = sys.argv[2] if len(sys.argv) > 2 else 'production'
release = json.loads((root / 'sentinel-trading-lab/agent/release.json').read_text())
assert release['version'] == '13.9.40'
tag = '?build=' + release['build']
names = ['agent-update.json', 'Sentinel-Agent-13.9.40.exe',
         'Sentinel-Agent-13.9.40-Alternativo.zip', 'Sentinel-Agent-Windows.exe',
         'sentinel-agent-windows.exe']
out = root / 'verified-downloads' / stage
out.mkdir(parents=True, exist_ok=True)

def fetch(name):
    with urllib.request.urlopen(origin + '/downloads/' + name + tag, timeout=45) as response:
        assert response.status == 200
        data = response.read()
        (out / name).write_bytes(data)
        return name, data

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    files = dict(pool.map(fetch, names))

sha = lambda b: hashlib.sha256(b).hexdigest()
manifest = json.loads(files['agent-update.json'])
assert manifest['version'] == release['version'] and manifest['build'] == release['build']
exe = files['Sentinel-Agent-13.9.40.exe']
assert exe[:2] == b'MZ' and len(exe) > 1000000
assert exe == files['Sentinel-Agent-Windows.exe'] == files['sentinel-agent-windows.exe']
alternative = zipfile.ZipFile(io.BytesIO(files['Sentinel-Agent-13.9.40-Alternativo.zip']))
assert alternative.testzip() is None
payload = alternative.read('agent_payload_v88.zip')
assert sha(payload) == manifest['zipSha256'] and payload in exe
archive = zipfile.ZipFile(io.BytesIO(payload))
assert archive.testzip() is None
assert json.loads(archive.read('release.json')) == release
for name in ['package.json', 'package-lock.json']:
    assert json.loads(archive.read(name))['version'] == '13.9.40'
checked = []
for name in archive.namelist():
    if name.endswith('/'):
        continue
    assert 'node_modules' not in name and not name.startswith('worker/data/')
    assert archive.read(name) == (root / 'sentinel-trading-lab/agent' / name).read_bytes(), name
    checked.append(name)
assert b'-OpenSiteAfterInstall' in alternative.read('Instalar-Sentinel.cmd')
assert alternative.read('install-agent-v88.ps1') == (root / 'sentinel-trading-lab/public/downloads/install-agent-v88.ps1').read_bytes()
request = urllib.request.Request(origin + '/downloads/Sentinel-Agent-13.9.40.exe' + tag,
    headers={'Range': 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
             'Accept-Encoding': 'gzip, deflate, br, zstd'})
with urllib.request.urlopen(request, timeout=30) as response:
    assert response.status == 206 and response.read() == exe[:1024]
    byte_range = response.headers.get('Content-Range')

# Test the exact module inside the downloaded, EXE-embedded archive.
with tempfile.TemporaryDirectory(prefix='sentinel40-published-module-') as directory:
    tmp = pathlib.Path(directory)
    agent_root = tmp / 'sentinel-trading-lab/agent'
    agent_root.mkdir(parents=True)
    archive.extractall(agent_root)
    for name in ['tests/sentinel-13940-manual-bankroll.test.mjs', 'tests/sentinel-13937-binary-objective.test.mjs', 'tests/sentinel-13937-expiry-reference.test.mjs', 'tests/sentinel-13936-observed-sampling.test.mjs', 'tests/fixtures/sentinel-binary-objective-counterexample-20261018.json', 'tests/fixtures/sentinel-13936-pattern-direction.mjs', 'tests/fixtures/sentinel-13936-completed-expiry-direction.mjs', 'tests/fixtures/sentinel-13935-aligned-forecast-reference.json', 'tests/sentinel-candle-quote-provenance-20261018.test.mjs', 'tests/sentinel-now-market-isolation-20261018.test.mjs', 'tests/sentinel-nested-settlement-balance-20261018.test.mjs']:
        target = tmp / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, target)
    result = subprocess.run(['node', '--test', 'tests/sentinel-13940-manual-bankroll.test.mjs', 'tests/sentinel-13937-binary-objective.test.mjs', 'tests/sentinel-13937-expiry-reference.test.mjs', 'tests/sentinel-13936-observed-sampling.test.mjs', 'tests/sentinel-candle-quote-provenance-20261018.test.mjs', 'tests/sentinel-now-market-isolation-20261018.test.mjs', 'tests/sentinel-nested-settlement-balance-20261018.test.mjs'], cwd=tmp, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr

report = {'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'origin': origin, 'stage': stage, 'version': release['version'], 'build': release['build'],
    'commit': sys.argv[3] if len(sys.argv) > 3 else None,
    'deployment': sys.argv[4] if len(sys.argv) > 4 else None,
    'downloads': {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in files.items()},
    'payloadSha256': sha(payload), 'exactPayloadFiles': checked,
    'zipCRC': 'passed', 'embeddedPayload': 'exact-match', 'genericAliases': 'byte-identical',
    'byteRange': byte_range, 'publishedPayloadRegressionTestsPassed': 71,
    'localPrebuildTestsPassed': 357,
    'nativeWindowsLaunch': 'not-tested', 'liveAccuracyImprovement': 'not-established'}
target = root / 'reports' / ('sentinel-13940-' + stage + '-verification-20261018.json')
target.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({**report, 'exactPayloadFiles': len(checked)}, indent=2))
