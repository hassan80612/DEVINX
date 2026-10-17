import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const downloads=join(process.cwd(),'sentinel-trading-lab','public','downloads');
const release=JSON.parse(readFileSync('sentinel-trading-lab/agent/release.json','utf8'));
const integrity=JSON.parse(readFileSync(join(downloads,'sentinel-windows-exe-integrity.json'),'utf8'));
const expected=readFileSync(join(downloads,`Sentinel-Agent-${release.version}.exe`));
const hash=data=>createHash('sha256').update(data).digest('hex');

test('Windows installer manifest identifies the EXE produced in THIS build',()=>{
 assert.equal(integrity.format,'sentinel-windows-exe-integrity-v1');
 assert.equal(integrity.version,release.version);
 assert.equal(integrity.build,release.build);
 assert.ok(expected.length>1000000);
 assert.equal(expected.subarray(0,2).toString('ascii'),'MZ');
 assert.equal(integrity.size,expected.length);
 assert.equal(integrity.sha256,hash(expected));
});

test('public download aliases contain precisely the versioned EXE, no stale content',()=>{
 for(const name of ['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe']){
  const bytes=readFileSync(join(downloads,name));
  assert.ok(bytes.equals(expected),name);
  assert.equal(hash(bytes),integrity.sha256,name);
 }
});

test('Next.js traces the verified EXE together with its matching integrity manifest',()=>{
 const config=readFileSync('sentinel-trading-lab/next.config.mjs','utf8');
 const handler=readFileSync('sentinel-trading-lab/src/app/api/agent/windows-exe/route.ts','utf8');
 assert.match(config,/sentinel-windows-exe-integrity\.json/);
 assert.match(handler,/sentinel_windows_exe_build_manifest_mismatch/);
 assert.match(handler,/Accept-Ranges/);
 assert.match(handler,/Content-Length/);
 assert.doesNotMatch(handler,/expectedGitBlobSha/);
});
