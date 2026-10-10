import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileEntryWithConfirmedReversal} from '../sentinel-trading-lab/agent/src/core/reversal-entry-arbitration.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';

const now=1800000000000,alertAt=now-5000;
const candidate=(side='CALL')=>({side,kind:'continuation',allowed:true,score:86,plan:{entryTiming:{sourceBarAt:now-5000}}});
const alert=(side='PUT',testing=false)=>({active:true,alert:{side,testing,createdAt:alertAt,invalidation:100.08,evidence:{source:'closed-5s-break-and-follow-through'}}});
const quote=(p)=>({quoteTs:now,price:p,quoteHistory:[{ts:now-800,price:100.02},{ts:now-550,price:100.03},{ts:now-250,price:p}]});
test('confirmed bearish reversal and no invalidation refuses to invent a late CALL continuation',()=>{
 const x=reconcileEntryWithConfirmedReversal(candidate(),alert(),quote(100.04),now);
 assert.equal(x.allowed,false);
 assert.equal(x.blockedBy,'opposite-reversal-evidence');
});
test('a large sustained move after reversal confirmation can STILL break and continue',()=>{
 const p={quoteTs:now,price:100.3,quoteHistory:[{ts:now-2500,price:100.12},{ts:now-1700,price:100.21},{ts:now-500,price:100.28},{ts:now,price:100.3}]};
 const x=reconcileEntryWithConfirmedReversal(candidate(),alert(),p,now);
 assert.equal(x.allowed,true);
 assert.equal(x.reversalArbitration,'new-continuation-confirmed');
});
test('mere wick beyond reversal invalidation is NOT evidence of lasting continuation',()=>{
 const p={quoteTs:now,price:100.07,quoteHistory:[{ts:now-2500,price:100.12},{ts:now-1700,price:100.21},{ts:now,price:100.07}]};
 assert.equal(reconcileEntryWithConfirmedReversal(candidate(),alert(),p,now).allowed,false);
});
test('potential reversal watch is not an execution lock; aligned reversal is not suppressed',()=>{
 const p=quote(100.04);
 assert.equal(reconcileEntryWithConfirmedReversal(candidate(),alert('PUT',true),p,now).allowed,true);
 assert.equal(reconcileEntryWithConfirmedReversal(candidate('PUT'),alert(),p,now).allowed,true);
 assert.equal(reconcileEntryWithConfirmedReversal(candidate(),{active:false},p,now).allowed,true);
});
test('PUT reconciles confirmed bullish reversal with a fresh bearish break',()=>{
 const yes={active:true,alert:{side:'CALL',testing:false,createdAt:alertAt,invalidation:100.01,evidence:{source:'closed-5s-break-and-follow-through'}}};
 const p={quoteTs:now,price:99.7,quoteHistory:[{ts:now-1800,price:99.93},{ts:now-1300,price:99.83},{ts:now,price:99.7}]};
 assert.equal(reconcileEntryWithConfirmedReversal(candidate('PUT'),yes,p,now).allowed,true);
 assert.equal(reconcileEntryWithConfirmedReversal(candidate('PUT'),yes,quote(100.03),now).allowed,false);
});
test('mobile shows exact Agent entryPrice and live quote separately',()=>{
 const s={state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:{asset:'EUR/USD',forecastHorizonSeconds:60,orderDurationMs:60000},
  liveBroker:{validatedSymbol:'EUR/USD',assetValidated:true,lastQuoteAt:now,quote:1.094},
  feed:{quoteTs:now,price:1.094},lastEvalMs:now,lastResult:{asset:'EUR/USD',analysis:{
   operationalSignal:{asset:'EUR/USD',forecastHorizonSeconds:60,durationMs:60000,state:'OPORTUNIDADE CONSUMIDA',
    scenario:{side:'CALL',confidence:71,createdAt:now-7000,deadline:now+43000},
    entryAnalyst:{independent:true,signal:{side:'CALL',state:'OPORTUNIDADE CONSUMIDA',entryAt:now-1500,entryPrice:1.092}},
    subanalyst:{mode:'reversal-alert',active:false}},
   generalConsensus:{rapid:{callPct:70},strategies:{callPct:65},displayCallPct:68}}}};
 const m=liveCardModel(s,now);assert.deepEqual(m.lastSignal,{asset:'EUR/USD',side:'CALL',price:1.092,at:now-1500});
 assert.equal(s.liveBroker.quote,1.094);
 s.lastResult.analysis.operationalSignal.entryAnalyst.signal.entryPrice=null;
 assert.equal(liveCardModel(s,now).lastSignal,null,'never manufacture entry price from live quote');
});
test('no duplicate mobile CALL/PUT directions from aggregate totals',async()=>{
 const s=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');
 assert.match(s,/mobileDecisionText=mobileDirection\?mobileDirection\+' AGORA':'AGUARDANDO'/);
 assert.match(s,/mobileTechnicalDetails/);
 assert.match(s,/PriceComparison|mobilePriceComparison/);
 const runtime=await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(runtime,/reconcileEntryWithConfirmedReversal\(candidate,reversalAlert,snap,now\)/);
});
