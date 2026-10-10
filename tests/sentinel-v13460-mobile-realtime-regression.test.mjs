import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
import {lightweightReadings} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';
const t=1800000000000,asset='EUR/USD OTC';
const quotes=Array.from({length:240},(_,i)=>({ts:t-(239-i)*1000,price:1.1+0.000002*i+Math.sin(i/8)*0.00003}));
function build(engine='automatic',durationMs=30000,call=true){
 const receipt={engineId:engine,asset,side:call?'CALL':'PUT',referencePrice:1.1000,quoteReceivedAt:t-50,issuedAt:t,
   expirySeconds:durationMs/1000,targetAt:t+durationMs,projectedPrice:call?1.1004:1.0996,
   expectedLow:1.0998,expectedHigh:1.1007,evidence:['unused long explanation']};
 return {state:'running',agentVersion:'13.4.60',lastEvalMs:t,settings:{engine,asset,orderDurationMs:durationMs,forecastHorizonSeconds:60},
  lastResult:{asset,analysis:{vnext:{
    engineId:engine,expirySeconds:durationMs/1000,computedStatus:'candidate-forward-prediction',receipt,
    cards:lightweightReadings({quoteHistory:quotes,receipt,now:t}),outcomesVerified:0,
    nowIndication:{side:receipt.side,engineId:engine,issuedAt:t,referencePrice:1.1000,
      projectedPrice:receipt.projectedPrice,expirySeconds:durationMs/1000,expiresAt:t+3000,
      verified:false,actionable:false}
  },operationalSignal:{asset,side:'AGUARDAR',state:'PROJETANDO',ready:false,actionable:false,
    forecastHorizonSeconds:durationMs/1000,durationMs,scenarioProjection:{
      side:receipt.side,asOf:t,horizonSeconds:durationMs/1000,targetAt:receipt.targetAt,
      projectedPrice:receipt.projectedPrice,engineId:engine
    }}}}};
}
const live={symbol:asset,validatedSymbol:asset,assetValidated:true,
 analysisFeedValidated:true,lastQuoteAt:t,quote:1.1003};
test('signed mobile frame contains new motor and expiry and full future forecast, no 45s cloud wait',()=>{
 const frame=analystSnapshot(build(),live);
 assert.equal(frame.settings.engine,'automatic');
 assert.equal(frame.settings.orderDurationMs,30000);
 assert.equal(frame.lastResult.analysis.vnext.receipt.side,'CALL');
 assert.equal(frame.lastResult.analysis.vnext.receipt.projectedPrice,1.1004);
 assert.equal(frame.lastResult.analysis.vnext.receipt.side,'CALL');
 assert.equal(frame.lastResult.analysis.vnext.cards.length,3);
 assert.equal(frame.lastResult.analysis.vnext.projection.side,'CALL');
 assert.equal(frame.lastResult.analysis.vnext.projection.kind,undefined);
 assert.equal(frame.lastResult.analysis.vnext.cards[0].id,'market-now');
 assert.equal(frame.lastResult.analysis.vnext.cards[1].id,'prior-structure');
 assert.equal(frame.lastResult.analysis.vnext.cards[2].id,'total-of-totals');
 assert.ok(Buffer.byteLength(JSON.stringify(frame),'utf8')+73<=3000,'frames including signature must fit bridge 3000-byte budget');
 assert.equal('quoteHistory' in frame,false);
 assert.equal('evidence' in frame.lastResult.analysis.vnext.receipt,false);
});
test('changing selected motor or expiry changes signed payload even on identical live quote timestamp',()=>{
 const a=analystSnapshot(build('automatic',30000,true),live);
 const b=analystSnapshot(build('breakout',30000,false),live);
 const c=analystSnapshot(build('breakout',15000,false),live);
 assert.notDeepEqual(a.settings,b.settings);
 assert.notDeepEqual(a.lastResult.analysis.vnext.receipt,b.lastResult.analysis.vnext.receipt);
 assert.notDeepEqual(b.lastResult.analysis.vnext.receipt,c.lastResult.analysis.vnext.receipt);
});
test('signed Broadcast sends motor switch urgently without repeating old analysis',()=>{
 let time=t;const sent=[];
 const bridge=new SignedLiveBridge('realtime:sentinel-'+'c'.repeat(48),'d'.repeat(64),{clock:()=>time});
 bridge.joined=true;bridge.verifiedViewerAt=t;
 bridge.socket={readyState:1,send:z=>sent.push(JSON.parse(z))};
 const first=analystSnapshot(build('automatic'),live),second=analystSnapshot(build('mean_reversion'),live);
 assert.equal(bridge.publish(first),true);
 time+=600;
 assert.equal(bridge.publish(second),true,'different motor must bypass ordinary cadence');
 assert.equal(sent.length,2);
 assert.equal(sent.at(-1).payload.payload.lastResult.analysis.vnext.engineId,'mean_reversion');
 assert.equal(sent.at(-1).payload.payload.sig.length,64);
 bridge.close();
});
test('three cards are informational, no vote or extra motor invocations',()=>{
 const cards=lightweightReadings({quoteHistory:quotes,receipt:build().lastResult.analysis.vnext.receipt,now:t});
 assert.equal(cards.length,3);
 for(const c of cards){
  assert.equal(c.callPct+c.putPct,100);
  assert.equal(c.kind,'directional-pressure-not-probability');
  assert.ok(['CALL','PUT','NEUTRO'].includes(c.side));
 }
});
test('mobile reducer merges signed engine, expiry and vnext fields while preserving full remote context',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/src/app/console/page.tsx',import.meta.url),'utf8');
 assert.match(s,/settings:\{\.\.\.\(previous\.settings\|\|\{\}\),\s*\.\.\.\(payload\.settings\|\|\{\}\)\}/);
 assert.match(s,/analysis:\{\.\.\.\(previous\.lastResult\?\.analysis\|\|\{\}\),\.\.\.\(payload\.lastResult\?\.analysis\|\|\{\}\)\}/);
});

test('normal and floating mobile use the SAME direct motor indication without remote polling',async()=>{
 const card=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 const model=await readFile(new URL('../sentinel-trading-lab/src/lib/live-card-model.ts',import.meta.url),'utf8');
 assert.ok((card.match(/\{forecastReceipt\}/g)||[]).length===2);
 assert.match(card,/PROJEÇÃO FUTURA/);
 assert.doesNotMatch(card,/AGORA · EM TESTE/);
 assert.match(model,/vnextNow=vnextReceipt&&fresh/);
 assert.match(model,/vnext\?\.engineId===s\?\.settings\?\.engine/);
});
