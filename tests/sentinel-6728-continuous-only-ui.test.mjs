import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {marketingMessages,marketingText} from '../sentinel-trading-lab/agent/src/core/marketing-messages.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const base='863aae94201964d80a358b04c29b1a46a96dab15';
test('no Selective control remains on website or native broker card',()=>{
 const m=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 const pc=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 assert.doesNotMatch(m,/<option value="selective"/);
 assert.doesNotMatch(m,/setForecastMode\(/);
 assert.doesNotMatch(pc,/<select data-sentinel-setting="forecastMode"/);
 assert.doesNotMatch(pc,/<option value="selective"/);
 assert.match(m,/data-testid="single-engine-selector"/);
 assert.match(pc,/data-sentinel-setting="duration"/);
});
test('previously saved Selective mode migrates once without changing Continuous rules',()=>{
 const worker=read('sentinel-trading-lab/agent/worker/index.mjs');
 assert.match(worker,/if\(runtime\.settings\.forecastMode==='selective'\)\{/);
 assert.match(worker,/runtime\.patchSettings\(\{forecastMode:'continuous'\}/);
 for(const path of [
  'sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs',
  'sentinel-trading-lab/agent/src/core/entry-window-planner.mjs',
  'sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs',
  'sentinel-trading-lab/agent/src/core/turn-pressure.mjs',
 ]){
   const original=execFileSync('git',['show',base+':'+path],{encoding:'utf8'});
   assert.equal(read(path),original,path);
 }
});
test('English locale is propagated through an independent Agent UI setting',()=>{
 const web=read('sentinel-trading-lab/src/app/console/page.tsx');
 const agent=read('sentinel-trading-lab/agent/worker/index.mjs');
 const browser=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 assert.match(web,/onLanguageChange=\{next=>\{void act\('settings',\{uiLanguage:next\}\)\}\}/);
 assert.match(agent,/uiLanguage:view\.settings\?\.uiLanguage\|\|'pt'/);
 assert.match(browser,/String\(d\.uiLanguage\|\|'pt'\)/);
 assert.match(browser,/key:'uiLanguage'/);
});
test('marketing semantic ids have PT and EN translations and no literal PT fallback',()=>{
 const page=read('sentinel-trading-lab/src/app/page.tsx');
 assert.ok(Object.keys(marketingMessages).length>=50);
 for(const [key,langs] of Object.entries(marketingMessages)){
  assert.ok(langs.pt&&langs.en,key);
  assert.equal(marketingText('pt',key),langs.pt);
  assert.equal(marketingText('en',key),langs.en);
 }
 const ids=[...page.matchAll(/<Msg id="([^"]+)"\/>/g)].map(m=>m[1]);
 assert.ok(ids.length>65);
 for(const id of ids)assert.ok(marketingMessages[id],id);
 assert.doesNotMatch(page,/<T>/);
});
