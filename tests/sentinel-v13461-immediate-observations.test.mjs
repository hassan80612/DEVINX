import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeImmediateMarket} from '../sentinel-trading-lab/agent/src/core/immediate-market-observation.mjs';
import {lightweightDashboard} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';
import {analystSnapshot} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';

const now=1800000000000;
function pricePath(reverse=false){
  const p=[];
  for(let i=0;i<90;i++){
    p.push({ts:now-(94-i)*1000,price:1.1001+Math.sin(i/7)*.00004});
  }
  // A current observation reacts at a PRIOR price extreme, rather than
  // blindly using the color/direction of the open chart candle.
  const earlierLow=Math.min(...p.map(q=>q.price));
  const updates=[earlierLow+.00003,earlierLow+.000006,earlierLow+.000001,
    earlierLow+.000004,earlierLow+.000025];
  for(let i=0;i<5;i++){
    p.push({ts:now-(4-i)*1000,price:reverse?2.2-updates[i]:updates[i]});
  }
  if(reverse)for(let i=0;i<90;i++)p[i].price=2.2-p[i].price;
  return p;
}

test('a live mapped support reaction can be observed promptly, without a fixed wait',()=>{
  const quoteHistory=pricePath(),result=observeImmediateMarket({
    quoteHistory,asOf:now,quoteTs:now
  });
  assert.equal(result?.side,'CALL');
  assert.equal(result?.kind,'support-reaction');
  assert.equal(result?.at,now);
  assert.equal(result?.expiresAt,now+3000);
  assert.equal(result?.tradeAuthorization,false);
});
test('the mirrored historical resistance produces an independent PUT observation',()=>{
  const result=observeImmediateMarket({quoteHistory:pricePath(true),asOf:now,quoteTs:now});
  assert.equal(result?.side,'PUT');
  assert.equal(result?.kind,'resistance-reaction');
});
test('old quotes never manufacture a current observation',()=>{
  assert.equal(observeImmediateMarket({quoteHistory:pricePath(),asOf:now+8000,quoteTs:now}),null);
});
test('the ONLY total of totals is the arithmetic average of market now and prior structure',()=>{
  const {cards}=lightweightDashboard({quoteHistory:pricePath(),now});
  assert.deepEqual(cards.map(c=>c.id),['market-now','prior-structure','total-of-totals']);
  assert.equal(cards[2].callPct,Math.round((cards[0].callPct+cards[1].callPct)/2));
  assert.equal(cards[2].putPct,100-cards[2].callPct);
});
test('signed mobile frame carries the same observed moment without running another motor',()=>{
  const observation=observeImmediateMarket({quoteHistory:pricePath(),asOf:now,quoteTs:now});
  const asset='EUR/USD OTC';
  const snapshot=analystSnapshot({
    state:'running',lastEvalMs:now,settings:{asset,engine:'automatic',orderDurationMs:30000},
    lastResult:{asset,analysis:{vnext:{
      engineId:'automatic',expirySeconds:30,nowIndication:{...observation,asset},
      cards:lightweightDashboard({quoteHistory:pricePath(),now}).cards
    },operationalSignal:{side:'AGUARDAR',actionable:false}}}
  },{symbol:asset,validatedSymbol:asset,assetValidated:true,analysisFeedValidated:true,lastQuoteAt:now,quote:1.1001});
  assert.equal(snapshot.lastResult.analysis.vnext.nowIndication.side,'CALL');
  assert.equal(snapshot.lastResult.analysis.operationalSignal.actionable,false);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot),'utf8')+73<=3000,
    'existing live transport size limit must still be satisfied');
});
test('PC and both mobile modes show NOW separately from exactly three totals',async()=>{
  const pc=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  const mobile=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
  assert.match(pc,/data-sentinel-card="immediate-market-observation"/);
  assert.match(pc,/data-sentinel-vnext-cards/);
  assert.match(mobile,/data-testid="vnext-immediate-observation"/);
  assert.equal((mobile.match(/\{instantObservation\}/g)||[]).length,2);
  assert.match(mobile,/vnextReadingsHeading/);
  assert.doesNotMatch(mobile,/<summary>Mercado Agora/);
});

test('PC receives a real broker quote and preserves the clock across reconciliation',async()=>{
  const worker=await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
  const pc=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
  assert.match(worker,/price:view\.liveBroker\?\.quote\?\?view\.feed\?\.price\?\?null/);
  assert.match(pc,/Number\(d\.price\)>0/);
  assert.match(pc,/\[data-sentinel-vnext-clock-value\]/);
  assert.match(pc,/el\.__sentinelTargetClockTick\?\.\(\)/);
  assert.match(pc,/ÚLTIMA PREVISÃO AVALIADA/);
});
test('a settled prediction is measured at its own fixed deadline, without changing the motor',async()=>{
  const {DemoTradingRuntime}=await import('../sentinel-trading-lab/agent/src/core/runtime.mjs');
  const runtime=new DemoTradingRuntime({enableVNext:true});
  const asset='EUR/USD OTC',duration=30000,t=now,initial=[];
  for(let i=0;i<120;i++)initial.push({ts:t-(119-i)*1000,price:1.1+Math.sin(i/10)*.00003+i*.0000001});
  runtime.patchSettings({asset,engine:'automatic',orderDurationMs:duration});
  const snap0={quoteHistory:initial,quoteTs:t,price:initial.at(-1).price,provider:'iq_option'};
  const first=runtime._signalValidationGate({analysis:{},snap:snap0,settings:runtime.settings,now:t});
  assert.equal(first.analysis.vnext.receipt?.targetAt,t+duration);
  const quotes=[...initial];
  for(let i=1;i<=30;i++)quotes.push({ts:t+i*1000,price:initial.at(-1).price+i*.0000009});
  const end=t+duration;
  const second=runtime._signalValidationGate({analysis:{},snap:{quoteHistory:quotes,quoteTs:end,price:quotes.at(-1).price,provider:'iq_option'},settings:runtime.settings,now:end});
  assert.ok(second.analysis.vnext.outcomesVerified>=1,'must validate against quote at target');
  assert.equal(second.analysis.vnext.lastSettled?.targetAt,t+duration);
  assert.equal(second.analysis.vnext.lastSettled?.settledPrice,quotes.at(-1).price);
  assert.equal(second.allowed,false,'a research outcome never authorizes automatic orders');
});
test('both mobile sizes keep anchored forecast and observed-now moment independently',async()=>{
  const mobile=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
  assert.equal((mobile.match(/\{instantObservation\}/g)||[]).length,2);
  assert.equal((mobile.match(/\{forecastReceipt\}/g)||[]).length,2);
  assert.match(mobile,/data-testid="last-settled-projection"/);
  assert.match(mobile,/expiryLabel\(Number\(m\.vnextNowObservation\.expirySeconds/);
});
