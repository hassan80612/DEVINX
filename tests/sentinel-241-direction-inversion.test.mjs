import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {invertApprovedDirection241} from '../sentinel-trading-lab/agent/src/core/experimental-opposite-direction-241.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {executorMonitor} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
const AT=1800000000000;
test('241: all approved CALL/PUT directions invert and displayed message matches signal',()=>{
 for(const side of ['CALL','PUT']){
  const initial={ready:true,side,reason:'historical-level-breakout',observedAt:AT,entryPrice:1.10004,durationMs:60000};
  const result=invertApprovedDirection241(initial),opposite=side==='CALL'?'PUT':'CALL';
  assert.equal(result.side,opposite);assert.equal(result.originalDecisionSide,side);
  assert.equal(result.experimentalDirectionInversion,true);
  assert.equal(result.marketPhaseLabel,'TESTE INVERSO · '+opposite);
  assert.equal(marketReading({candidate:result,phase:result.marketPhase,label:result.marketPhaseLabel,trendSide:result.marketTrendSide}),'TESTE INVERSO · '+opposite);
  assert.equal(result.durationMs,60000);assert.equal(result.entryPrice,initial.entryPrice);
  assert.strictEqual(invertApprovedDirection241(result),result);assert.equal(initial.side,side);
 }
});
test('241: never turn a WAIT or final veto into an order',()=>{
 for(const x of [{ready:false,side:null},{ready:false,side:'CALL'}])assert.strictEqual(invertApprovedDirection241(x),x);
});
test('241: expiration and the immutable entry-window direction agree for each duration',()=>{
 for(const durationMs of [30000,60000,300000]){
  const selected=invertApprovedDirection241({ready:true,side:'CALL',reason:'confirmed-level-structure-reversal',observedAt:AT,entryPrice:1.12345});
  const next=advanceNowOpportunity({previous:null,candidate:selected,now:AT,quoteAt:AT,asset:'EUR/GBP OTC',provider:'IQ Option',engineId:'automatic',durationMs});
  assert.equal(next.side,'PUT');assert.equal(next.holdingSeconds,durationMs/1000);
  assert.equal(next.exitAt-next.entryAt,durationMs);
 }
});
test('241: graph warning removed and existing native expiry keeper is intact',()=>{
 const html=executorMonitor({sessionWins:1,sessionLosses:2,enabled:false,durationMs:60000,config:{}},'pt',{state:'watch',reason:'Caution'});
 assert.doesNotMatch(html,/GRÁFICO:|GRAPH:|data-sentinel-market-condition/);
 const keeper=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
});
