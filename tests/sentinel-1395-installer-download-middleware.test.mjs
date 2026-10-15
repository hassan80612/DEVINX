import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import nextConfig from '../sentinel-trading-lab/next.config.mjs';

const middleware=readFileSync('sentinel-trading-lab/src/middleware.ts','utf8');
const line=middleware.split('\n').find(x=>x.includes('const installerFile='));
const value=line?.trim().match(/^const installerFile=(\/\^.+\$\/i)\.test\(p\);$/);
assert.ok(value,'public EXE route must have explicit anchored regex');
const literal=value[1],matching=new RegExp(literal.slice(1,-2),'i');

test('download route is a narrow static Windows EXE allowlist, not an auth bypass',()=>{
 for(const url of ['/downloads/Sentinel-Agent-Windows.exe',
   '/downloads/sentinel-agent-windows.exe',
   '/downloads/Sentinel-Agent-13.9.5.exe',
   '/downloads/Sentinel-Agent-13.4.67.21.exe',
   '/downloads/Sentinel-Agent-V13.3.exe'])assert.equal(matching.test(url),true,url);
 for(const url of ['/downloads/agent_payload_v88.zip',
   '/downloads/agent-update.json','/api/auth/me','/painel',
   '/downloads/Sentinel-Agent-Windows.exe/anything',
   '/downloads/Sentinel-Agent-Windows.exe.zip',
   '/downloads/../api/auth/me',
   '/downloads/Sentinel-Agent-Windows.exe/../../api/auth/me'])
    assert.equal(matching.test(url),false,url);
 const early=middleware.indexOf('if(installerFile)return NextResponse.next()');
 const protect=middleware.indexOf("if(p==='/downloads/agent_payload_v88.zip'");
 assert.ok(early>0&&protect>early,'ZIP auth stays after standalone executable allowance');
 assert.match(middleware,/accessActive===true/);
 assert.match(middleware,/update_requires_paid_access/);
});

test('the stable downloadable filename is announced as a binary attachment',async()=>{
 const all=await nextConfig.headers();
 for(const url of ['/downloads/Sentinel-Agent-Windows.exe',
  '/downloads/sentinel-agent-windows.exe']){
  const rule=all.find(x=>x.source===url);
  assert.equal(rule?.headers.find(x=>x.key==='Content-Type')?.value,
   'application/octet-stream',url);
  assert.match(rule?.headers.find(x=>x.key==='Content-Disposition')?.value||'',
   /attachment/);
 }
});

test('downloaded installer still includes entitlement-gated runtime and signed auto-update',()=>{
 const launcher=readFileSync('sentinel-trading-lab/agent-launcher.go','utf8');
 const updater=readFileSync('sentinel-trading-lab/agent/worker/auto-update.ps1','utf8');
 assert.match(launcher,/go:embed public\/downloads\/agent_payload_v88.zip/);
 assert.match(updater,/accessActive -ne \$true/);
 assert.match(updater,/Get-FileHash \$zip -Algorithm SHA256/);
 assert.match(updater,/X-Sentinel-Agent-Install/);
});
