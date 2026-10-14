import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const read=p=>fs.readFileSync(p,'utf8');
const baseline='5c39706d88667b60b7e8e42d165a21a711c01a2d';
const panel=read('sentinel-trading-lab/src/app/console/page.tsx');
test('mobile locale is local and does not send commands to the PC',()=>{
 const start=panel.indexOf('  // Language belongs to the SITE');
 const end=panel.indexOf('  const agentCommand=',start);
 assert.ok(start>0&&end>start);
 const sync=panel.slice(start,end);
 const guard=sync.indexOf('if(mobileBrowser)return;');
 const push=sync.indexOf("cloudFetch('settings','PATCH',update)");
 assert.ok(guard>0&&push>guard,'mobile must leave before any remote Agent request');
 assert.match(sync,/Android\|iPhone\|iPad\|iPod/);
 assert.match(sync,/if\(mobileBrowser\)return;/);
 assert.match(sync,/localFetch\('settings','PATCH',update,2200\)/);
 assert.match(sync,/if\(!disposed&&attempts<4\)retryTimer=setTimeout/);
 assert.doesNotMatch(sync,/requestImmediateEvaluation|\.tick\(|setBusy\(|setInterval\(|orderDurationMs/);
});
test('mobile and PC share only market frames, not the locale selector',()=>{
 assert.match(panel,/<LanguageSwitcher\/>/);
 assert.doesNotMatch(panel,/<LanguageSwitcher onLanguageChange=/);
 assert.match(panel,/const WEB_RELEASE_VERSION='67\.31\.3';/);
 assert.match(panel,/const AVAILABLE_AGENT_VERSION='13\.4\.67\.31';/);
});
test('original realtime transport and forecast remain byte-identical; only PC display reconciliation may change',()=>{
 const files=[
  'sentinel-trading-lab/src/components/LiveScenarioCard.tsx',
  'sentinel-trading-lab/src/lib/pc-authoritative-window.mjs',
  'sentinel-trading-lab/src/lib/signed-live-analyst-channel.ts',
  'sentinel-trading-lab/agent/src/core/runtime.mjs',
  'sentinel-trading-lab/agent/worker/index.mjs',
  'sentinel-trading-lab/agent/worker/local-playwright-driver.mjs'
 ];
 for(const path of files)assert.equal(read(path),execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'}),path);
});
