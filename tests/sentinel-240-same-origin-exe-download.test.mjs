import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import nextConfig from '../sentinel-trading-lab/next.config.mjs';

const root=new URL('../sentinel-trading-lab/',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const release=JSON.parse(read('agent/release.json').toString('utf8'));
const proof=JSON.parse(read('public/downloads/sentinel-243-verified.json').toString('utf8'));
const fileName='Sentinel-Agent-'+release.version+'.exe';
const url='/downloads/'+fileName;
const page=read('src/app/console/page.tsx').toString('utf8');

test('240: primary EXE uses 239-tested GitHub raw transport and 240 pinned binary',()=>{
 assert.equal(release.version,'13.9.243');
 assert.ok(page.includes("const AGENT_DOWNLOAD_URL=`https://raw.githubusercontent.com/hassan80612/DEVINX/refs/heads/fix/sentinel-243-expiry-persistence-only-20261103/sentinel-trading-lab/public/downloads/Sentinel-Agent-${encodeURIComponent(AVAILABLE_AGENT_VERSION)}.exe`"));
 assert.doesNotMatch(page,/const AGENT_DOWNLOAD_URL=`\/downloads\//);
 assert.equal((page.match(/href=\{AGENT_DOWNLOAD_URL\} download=\{/g)||[]).length,3);
});

test('240: same-origin URL is a versioned immutable REAL Windows PE and matches tested sha256',()=>{
 const actual=read('public/downloads/'+fileName);
 const stable=read('public/downloads/Sentinel-Agent-Windows.exe');
 const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
 assert.ok(actual.length>1_000_000);
 assert.equal(actual.toString('ascii',0,2),'MZ');
 assert.equal(actual.length,stable.length);
 assert.equal(sha(actual),proof.exeSha256);
 assert.equal(sha(stable),proof.exeSha256);
 assert.equal(proof.windowsTested,true);
 assert.equal(proof.version,release.version);
});

test('240: same-origin fallback still has binary headers and no redirect',async()=>{
 const [headers,redirects]=await Promise.all([nextConfig.headers(),nextConfig.redirects()]);
 const matching=headers.find(x=>x.source===url);
 assert.ok(matching,'missing exact versioned EXE headers');
 const get=name=>matching.headers.find(x=>x.key===name)?.value;
 assert.equal(get('Content-Type'),'application/octet-stream');
 assert.equal(get('Content-Disposition'),'attachment; filename="'+fileName+'"');
 assert.equal(get('Cache-Control'),'private, no-store');
 assert.equal(redirects.some(r=>r.source===url),false);
 const middleware=read('src/middleware.ts').toString('utf8');
 assert.match(middleware,/if\(installerFile\)return NextResponse\.next\(\)/);
 assert.match(middleware,/const installerFile=/);
});

test('240: ZIP alternative and all agent logic remain outside this hotfix',()=>{
 assert.match(page,/AGENT_ZIP_DOWNLOAD_URL=`\/downloads\/Sentinel-Agent-/);
 const keeper=read('agent/worker/broker-native-expiry-keeper.mjs').toString('utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
});
