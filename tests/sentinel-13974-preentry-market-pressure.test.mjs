import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {currentMarketConflict,MarketPressureEvidence,applyMarketPressureGuard} from '../sentinel-trading-lab/agent/src/core/market-pressure-entry-guard.mjs';
import {lightweightDashboard} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';
import {shortProbability} from '../sentinel-trading-lab/agent/src/core/short-probability.mjs';
const at=1792500000000;
const original={ready:true,side:'CALL',strength:40,reason:'closed-structure-and-live-impulse',entryPrice:1.1,observedAt:at};
const cards=[
 {id:'market-now',callPct:32,putPct:68},
 {id:'prior-structure',callPct:56,putPct:44},
 {id:'total-of-totals',callPct:44,putPct:56}
];
const estimate={pCall:.46,pPut:.54};
const context='exnova|USD/BRL OTC|automatic|30000';
const pressure=()=>currentMarketConflict({original,estimate,cards,durationMs:30000});
test('photo-like 68% current PUT, 56% blended PUT, 54% probability is a conflict BEFORE entry',()=>{
 const c=pressure();
 assert.equal(c.conflict,true);
 assert.equal(c.originalSide,'CALL');
 assert.equal(c.oppositeSide,'PUT');
 assert.equal(c.nowOpp,68);
 assert.equal(c.totalOpp,56);
 assert.equal(c.probabilityOpp,.54);
});
test('presentation indices alone cannot veto a previously qualified win without independent outcomes',()=>{
 const c=pressure();
 assert.equal(applyMarketPressureGuard(original,original,c,{approved:false,n:0}).side,'CALL');
 assert.equal(applyMarketPressureGuard(original,original,c,{approved:false,n:0}).ready,true);
 const uncalibrated={pCall:.62,pPut:.38};
 assert.equal(currentMarketConflict({original,estimate:uncalibrated,cards,durationMs:30000}).conflict,false);
});
test('pressure veto only after sixteen independent evidence windows show repeated misses',()=>{
 const audit=new MarketPressureEvidence();
 let proof;
 for(let i=0;i<16;i++){
  const t=at+i*32000,enter=1.1,leave=1.0998;
  audit.observe({context,now:t,quoteAt:t,price:enter,quoteHistory:[{ts:t,price:enter}],
    original,pressure:pressure(),marketValid:true,expiryMs:30000});
  proof=audit.observe({context,now:t+30100,quoteAt:t+30000,price:leave,
    quoteHistory:[{ts:t,price:enter},{ts:t+30000,price:leave}],
    original:null,pressure:null,marketValid:false,expiryMs:30000});
 }
 assert.equal(proof.n,16);
 assert.equal(proof.originalLosses,16);
 assert.equal(proof.approved,true);
 const blocked=applyMarketPressureGuard(original,original,pressure(),proof);
 assert.equal(blocked.side,null);
 assert.equal(blocked.ready,false);
 assert.equal(blocked.reason,'historically-verified-market-pressure-conflict');
});
test('if conflicting pressure tends to precede wins, no blocking takes place',()=>{
 const audit=new MarketPressureEvidence();
 let p;
 for(let i=0;i<16;i++){
  const t=at+i*32000;
  audit.observe({context,now:t,quoteAt:t,price:1.1,
    quoteHistory:[{ts:t,price:1.1}],expiryMs:30000,
    original,pressure:pressure(),marketValid:true});
  p=audit.observe({context,now:t+30100,quoteAt:t+30000,price:1.1002,
    quoteHistory:[{ts:t+30000,price:1.1002}],expiryMs:30000,marketValid:false});
 }
 assert.equal(p.originalWins,16);
 assert.equal(p.approved,false);
 assert.equal(applyMarketPressureGuard(original,original,pressure(),p).ready,true);
});
test('completed structural reversals, missing readings, neutral signals, and 15s avoid overrides',()=>{
 const s={...original,reason:'closed-range-extreme-reversal-confirmed'};
 assert.equal(currentMarketConflict({original:s,cards,estimate,durationMs:30000}).conflict,false);
 assert.equal(currentMarketConflict({original,estimate,cards:[],durationMs:30000}).conflict,false);
 assert.equal(currentMarketConflict({original,estimate,cards,durationMs:15000}).conflict,false);
 assert.equal(currentMarketConflict({original,estimate:null,cards,durationMs:30000}).conflict,false);
 assert.equal(applyMarketPressureGuard({...original,strength:75},original,pressure(),{n:20,approved:true}).ready,true);
 assert.equal(applyMarketPressureGuard(original,original,pressure(),{n:15,approved:true}).ready,true);
});
test('late quotes do not become verified quote-at-expiry results',()=>{
 const audit=new MarketPressureEvidence();
 audit.observe({context,now:at,quoteAt:at,price:1.1,quoteHistory:[{ts:at,price:1.1}],
  original,pressure:pressure(),marketValid:true,expiryMs:30000});
 const out=audit.observe({context,now:at+31000,quoteAt:at+31000,price:1.09,
  quoteHistory:[{ts:at+31000,price:1.09}],expiryMs:30000,marketValid:false});
 assert.equal(out.n,0);
 assert.equal(out.approved,false);
});
test('8s and 60s readings displayed on PC/mobile are evaluated before one-shot broker signal',()=>{
 const rt=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 const gate=rt.slice(rt.indexOf('_signalValidationGate('),rt.indexOf('if(settings.engine){',rt.indexOf('_signalValidationGate(')));
 const readings=gate.indexOf('const readings=lightweightDashboard(');
 const pressure=gate.indexOf('currentMarketConflict(');
 const next=gate.indexOf('advanceNowOpportunity(');
 const publish=gate.indexOf('this.onNowOpportunity(anchor)');
 assert.ok(readings>0&&pressure>readings&&next>pressure&&publish>next);
 assert.equal(gate.split('const readings=lightweightDashboard(').length-1,1);
 assert.match(gate,/cards:readings.cards/);
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/market-pressure-entry-guard.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bawait\b|\bfetch\s*\(|setTimeout\s*\(|setInterval\s*\(|\bdriver\./);
});
test('same-quote dashboard is CPU-only and uses no delayed I/O',()=>{
 const quoteHistory=Array.from({length:950},(_,i)=>({ts:at-949000+i*1000,price:1.1+Math.sin(i*.13)*.00007}));
 const latest=quoteHistory.at(-1);
 const p=shortProbability({quoteHistory,quoteAt:at,price:latest.price,durationMs:30000,now:at,payout:.8});
 const start=performance.now();
 for(let i=0;i<40;i++){
  const actual=lightweightDashboard({quoteHistory,now:at}).cards;
  const verdict=currentMarketConflict({original,estimate:p,cards:actual,durationMs:30000});
  assert.equal(typeof verdict.conflict,'boolean');
 }
 assert.ok(performance.now()-start<1500,'forty pre-entry dashboard computations should not add meaningful latency');
});
