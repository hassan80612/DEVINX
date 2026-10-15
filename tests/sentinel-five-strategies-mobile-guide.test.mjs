import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VISIBLE_STRATEGIES,TECHNICAL_STRATEGY_IDS,normalizeUserStrategy} from '../sentinel-trading-lab/agent/src/core/visible-strategy-guide.mjs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
import {automaticChartContext} from '../sentinel-trading-lab/agent/src/core/automatic-chart-context.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const read=p=>readFileSync(p,'utf8');
const A=Date.UTC(2026,9,15,14);
function path(kind,n=220){
 const out=[];
 for(let i=0;i<n;i++){
  const y=kind==='trend'?i*.000025:
   kind==='turn'?(i<100?-i*.00002:-100*.00002+(i-100)*.00005):
   kind==='range'?.0004*Math.sin(i*.18):i*.000006;
  out.push({ts:A+i*1000,receivedAt:A+i*1000,price:1.1*Math.exp(y+.000012*Math.sin(i*.3))});
 }
 return out;
}
test('exactly five offered choices: Automatic plus four retained specialists',()=>{
 assert.deepEqual(VISIBLE_STRATEGIES.map(x=>x.id),
 ['automatic','fibonacci_retest','trend','support_resistance','smart_confluence']);
 assert.equal(TECHNICAL_STRATEGY_IDS.length,4);
 for(const id of ['price_action','mean_reversion','breakout','trendline_breakout'])
  assert.equal(normalizeUserStrategy(id),'automatic');
});
test('all chart-usage hints are fully translated to English',()=>{
 for(const e of VISIBLE_STRATEGIES){
  assert.match(e.when,/Quando usar:/);
  assert.match(sentinelText('en',e.when),/^When to use:/);
  assert.notEqual(sentinelText('en',e.short),e.short);
 }
});
test('actual PC overlay and mobile selector use curated list, without duplicate legacy option menus',()=>{
 const pc=read('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs');
 const mobile=read('sentinel-trading-lab/src/components/LiveScenarioCard.tsx');
 const panel=read('sentinel-trading-lab/src/app/console/page.tsx');
 for(const c of [pc,mobile,panel])assert.match(c,/VISIBLE_STRATEGIES/);
 assert.match(pc,/data-sentinel-strategy-when/);
 assert.match(pc,/pc-strategy-when-guide/);
 assert.match(mobile,/strategy-when-guide/);
 assert.match(panel,/strategy-when-full-guide/);
 for(const id of ['price_action','mean_reversion','breakout','trendline_breakout']){
  // Decommissioned IDs can exist in engine internals, never in selectable
  // PC <option> values.
  const ui=pc.slice(pc.indexOf('<select data-sentinel-setting="engine"'),pc.indexOf('</select>',pc.indexOf('<select data-sentinel-setting="engine"')));
  assert.doesNotMatch(ui,new RegExp('<option value="'+id+'"'));
 }
});
test('Automatic respects pre-existing 30s/60s directional predictions',()=>{
 for(const durationMs of [30000,60000])for(const kind of ['trend','turn','range']){
  const qs=path(kind),q=qs.at(-1);
  const input={quoteHistory:qs,quoteAt:q.ts,price:q.price,now:q.ts,durationMs,engineId:'automatic'};
  const published=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v1'});
  const next=analyzeNowOpportunity({...input,qualityPolicy:'adaptive-market-v17'});
  for(const k of ['ready','side','reason','entryPrice','observedAt'])
   assert.equal(next[k],published[k],kind+' '+k+' '+durationMs);
  assert.ok(TECHNICAL_STRATEGY_IDS.includes(next.contextStrategy));
  assert.equal(next.signalOwner,'shared-market-base');
 }
});
test('legacy settings migrate to the four retained technical options',()=>{
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 runtime.patchSettings({engine:'mean_reversion',strategy:'breakout',strategy2:'trendline_breakout'});
 assert.equal(runtime.settings.engine,'automatic');
 assert.equal(runtime.settings.strategy,'smart_confluence');
 assert.equal(runtime.settings.strategy2,'none');
 const restored=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 restored.restore({settings:{engine:'price_action',strategy:'mean_reversion',strategy2:'breakout'}});
 assert.equal(restored.settings.engine,'automatic');
 assert.equal(restored.settings.strategy,'smart_confluence');
 assert.equal(restored.settings.strategy2,'none');
});
test('both languages explain the phone is a display that requires the PC and broker online',()=>{
 const home=read('sentinel-trading-lab/src/app/page.tsx');
 assert.match(home,/PC .*?ligado|computador LIGADO/);
 assert.match(home,/computer ON/);
 assert.match(home,/ENTRADA AGORA/);
 assert.match(home,/OPERAÇÃO EM ANDAMENTO/);
 assert.match(home,/Agent OFF/);
 assert.match(home,/same Sentinel account|MESMA conta Sentinel/);
 assert.match(home,/mobileSteps\.map/);
});
