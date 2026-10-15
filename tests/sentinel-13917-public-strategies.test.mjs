import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STRATEGY_CHOICES,PUBLIC_STRATEGY_IDS,normalizePublicStrategy,publicStrategyInfo}
 from '../sentinel-trading-lab/agent/src/core/public-strategies.mjs';
import {selectedScenarioEngine} from '../sentinel-trading-lab/agent/src/core/scenario-engine-catalog.mjs';
import {sentinelText} from '../sentinel-trading-lab/agent/src/core/ui-texts.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const expected=['automatic','fibonacci_retest','trend','support_resistance','smart_confluence'];
test('exact five public modes, automatic retained, retired options no longer selectable',()=>{
 assert.deepEqual(PUBLIC_STRATEGY_IDS,expected);
 for(const mode of expected){
  assert.equal(normalizePublicStrategy(mode),mode);
  assert.equal(selectedScenarioEngine({engine:mode}).id,mode);
  assert.ok(publicStrategyInfo(mode).when.startsWith('Quando usar: '));
 }
 for(const old of ['price_action','mean_reversion','breakout','trendline_breakout']){
  assert.equal(normalizePublicStrategy(old),'automatic');
  assert.equal(selectedScenarioEngine({engine:old}).id,'automatic');
 }
});
test('every guidance message has an English translation, with PT still the original',()=>{
 assert.equal(sentinelText('en','Qual estratégia usar em cada gráfico?'),'Which strategy suits each chart?');
 for(const s of STRATEGY_CHOICES){
  assert.equal(sentinelText('pt',s.when),s.when);
  const translated=sentinelText('en',s.when);
  assert.notEqual(translated,s.when,s.id);
  assert.ok(translated.includes('When to use:'),s.id);
 }
});
test('mobile and PC display the same public strategy catalog and expandable explanations',()=>{
 const mobile=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 const pc=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 assert.match(mobile,/PUBLIC_STRATEGY_IDS\.some\(id=>id===e\.id\)/);
 assert.match(mobile,/STRATEGY_CHOICES\.map\(e=>/);
 assert.match(mobile,/data-testid="strategy-when-to-use"/);
 assert.match(pc,/payload\.publicStrategies=STRATEGY_CHOICES/);
 assert.match(pc,/data-sentinel-strategy-guide/);
 assert.match(pc,/strategyChoices\.map\(selectableOption\)/);
 assert.doesNotMatch(pc,/<option value="price_action"/);
 assert.doesNotMatch(pc,/<option value="mean_reversion"/);
 assert.doesNotMatch(pc,/<option value="breakout"/);
 assert.doesNotMatch(pc,/<option value="trendline_breakout"/);
});
test('old settings safely migrate without deleting the shared market base',()=>{
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.patchSettings({engine:'price_action',strategy:'trendline_breakout',strategy2:'mean_reversion',strategy3:'breakout'});
 assert.equal(r.settings.engine,'automatic');
 assert.equal(r.settings.strategy,'smart_confluence');
 assert.equal(r.settings.strategy2,'none');
 assert.equal(r.settings.strategy3,'none');
 r.patchSettings({engine:'fibonacci_retest',strategy:'fibonacci_retest'});
 assert.equal(r.settings.engine,'fibonacci_retest');
 const saved=r.snapshotPersistent();
 saved.settings.engine='breakout';saved.settings.strategy='price_action';
 const restored=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'}).restore(saved);
 assert.equal(restored.settings.engine,'automatic');
 assert.equal(restored.settings.strategy,'smart_confluence');
});
const T=Date.UTC(2026,9,15,13);
const q=Array.from({length:170},(_,i)=>({
 ts:T+i*1000,receivedAt:T+i*1000,
 price:1.13*Math.exp(i*.000017+Math.sin(i*.25)*.000024)
}));
for(const durationMs of [30000,60000]){
 test('the chosen native strategy owns its own directional result, not the Automatic forecast ('+durationMs/1000+'s)',()=>{
  const quote=q.at(-1),args={quoteHistory:q,quoteAt:quote.ts,price:quote.price,now:quote.ts,durationMs};
  for(const engineId of expected.filter(x=>x!=='automatic')){
   const base=analyzeNowOpportunity({...args,engineId});
   const live=analyzeNowOpportunity({...args,engineId,qualityPolicy:'adaptive-market-v1'});
   for(const k of ['side','ready','reason','entryPrice'])assert.deepEqual(live[k],base[k],engineId+' '+k);
   assert.equal(live.contextStrategy,engineId);
   assert.equal(live.signalOwner,'shared-market-base');
  }
 });
}
