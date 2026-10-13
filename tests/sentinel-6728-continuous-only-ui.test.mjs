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
 const restored='7cd0e7315fd7b6a59ad82142ffc8db7491c902ca';
 const ref=path=>execFileSync('git',['show',restored+':'+path],{encoding:'utf8'});
 // Exact 67.26 clock/entry confirmation, not a new imitation of old behavior.
 for(const path of [
  'sentinel-trading-lab/agent/src/core/entry-window-planner.mjs',
  'sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs',
 ])assert.equal(read(path),ref(path),path);
 const file='sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
 const original=ref(file),updated=read(file);
 const continuous=s=>s.slice(s.indexOf('function continuousWindow('),s.indexOf('export function futureEntrySchedule('));
 const confirm=s=>s.slice(s.indexOf(" const engineId=String(settings.engine||'automatic');",s.indexOf('export function confirmWindowEntry(')));
 assert.equal(continuous(updated),continuous(original),'continuous window source changed');
 assert.equal(confirm(updated),confirm(original),'continuous entry confirmation changed');
 assert.match(updated,/forecast.side&&oppositeTurnPressure/); // kept only in hidden Seletiva
 const pressure='sentinel-trading-lab/agent/src/core/turn-pressure.mjs';
 assert.equal(read(pressure),execFileSync('git',['show',base+':'+pressure],{encoding:'utf8'}));
});
test('English locale is propagated through an independent Agent UI setting',()=>{
 const web=read('sentinel-trading-lab/src/app/console/page.tsx');
 const agent=read('sentinel-trading-lab/agent/worker/index.mjs');
 const browser=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 assert.match(web,/<LanguageSwitcher\/>/);
 assert.doesNotMatch(web,/onLanguageChange=\{next/);
 assert.match(web,/const update=\{uiLanguage:language\}/);
 assert.match(web,/if\(!disposed&&attempts<4\)retryTimer=setTimeout/);
 assert.match(agent,/uiLanguage:view\.settings\?\.uiLanguage\|\|'pt'/);
 assert.match(browser,/String\(d\.uiLanguage\|\|'pt'\)/);
 assert.doesNotMatch(browser,/data-sentinel-ui-language/);
 assert.match(browser,/const PC_UI_EN=Object\.freeze\(Object\.fromEntries/);
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
 assert.ok(ids.length>=15,'compact home must preserve bilingual semantic messages');
 for(const id of ids)assert.ok(marketingMessages[id],id);
 assert.doesNotMatch(page,/<T>/);
});
