import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import nextConfig from '../sentinel-trading-lab/next.config.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const base='sentinel-trading-lab/public/downloads/';
const release=JSON.parse(read('sentinel-trading-lab/agent/release.json'));
const manifest=JSON.parse(read(base+'agent-update.json'));
test('216: CI-built and published Windows EXE embeds matching exact payload ZIP',()=>{
 const binary=read(base+'Sentinel-Agent-'+release.version+'.exe');
 const zip=read(base+'agent_payload_v88.zip');
 assert.equal(manifest.version,release.version);
 assert.equal(manifest.build,release.build);
 assert.equal(hash(zip),manifest.zipSha256);
 assert.ok(binary.length>1000000);
 assert.ok(binary.indexOf(zip)>=0,'exact CI verified payload embedded in EXE');
 for(const alias of ['Sentinel-Agent-Windows.exe','sentinel-agent-windows.exe'])
  assert.ok(binary.equals(read(base+alias)),alias);
});
test('216: prevent independent EXE repackaging by Vercel',()=>{
 const s=read('sentinel-trading-lab/scripts/build-sentinel-137-installer.mjs').toString('utf8');
 const gate=s.indexOf("if(process.env.VERCEL==='1'){");
 const build=s.indexOf("tool(goBinary,['build'");
 assert.ok(gate>=0&&build>gate);
 assert.match(s,/vercel_prebuilt_exe_does_not_embed_exact_zip/);
 assert.match(s,/vercel_prebuilt_payload_manifest_mismatch/);
});
test('216: browser download has stable versioned URL and filename; aliases preserved',async()=>{
 const s=read('sentinel-trading-lab/src/app/console/page.tsx').toString('utf8');
 assert.match(s,/AGENT_DOWNLOAD_URL=`\/downloads\/Sentinel-Agent-\$\{encodeURIComponent\(AVAILABLE_AGENT_VERSION\)\}\.exe`/);
 assert.doesNotMatch(s,/AGENT_DOWNLOAD_URL=.*\?build=/);
 assert.equal((s.match(/download=\{`Sentinel-Agent-\$\{AVAILABLE_AGENT_VERSION\}\.exe`\}/g)||[]).length,3);
 const headers=await nextConfig.headers();
 const rule=headers.find(x=>x.source==='/downloads/Sentinel-Agent-'+release.version+'.exe');
 assert.equal(rule.headers.find(x=>x.key==='Content-Disposition').value,
  'attachment; filename="Sentinel-Agent-'+release.version+'.exe"');
 assert.ok(headers.some(x=>x.source==='/downloads/sentinel-agent-windows.exe'));
});
