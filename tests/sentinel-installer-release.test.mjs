import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base='sentinel-trading-lab';
const release=JSON.parse(readFileSync(`${base}/agent/release.json`,'utf8'));
const manifest=JSON.parse(readFileSync(`${base}/agent/package.json`,'utf8'));
const installer=readFileSync(`${base}/public/downloads/install-agent-v88.ps1`,'utf8');
const launcher=readFileSync(`${base}/agent-launcher.go`,'utf8');

test('Agent package and authoritative build metadata agree',()=>{
  assert.equal(manifest.version,release.version);
  assert.ok(release.version&&release.build);
  assert.ok(release.build.startsWith(release.version+'-'));
});
test('the Windows install script must never pin an obsolete Agent version',()=>{
  assert.doesNotMatch(installer,/\b13\.4\.\d+\b/);
  assert.match(installer,/\$manifest\.version -ne \$agentRelease\.version/);
  assert.match(installer,/\$agentRelease\.version -ne \$expectedVersion/);
  assert.match(installer,/\$agentRelease\.build -ne \$expectedBuild/);
  assert.match(installer,/\$h\.version -eq \$expectedVersion/);
  assert.match(installer,/\$h\.build -eq \$expectedBuild/);
  assert.match(installer,/VerifyPayloadOnly/);
});
test('the Windows executable embeds the same expected release as its ZIP',()=>{
  assert.match(launcher,/go:embed agent\/release\.json/);
  assert.match(launcher,/go:embed public\/downloads\/agent_payload_v88\.zip/);
  assert.match(launcher,/"-ExpectedVersion", expected\.Version/);
  assert.match(launcher,/"-ExpectedBuild", expected\.Build/);
  assert.match(launcher,/SENTINEL_INSTALL_VERIFY_ONLY/);
});
