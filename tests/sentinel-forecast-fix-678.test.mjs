import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {qualifyStrategyInterval,strategyEvidence} from '../sentinel-trading-lab/agent/src/core/selective-forward-model.mjs';
import {SignedLiveBridge} from '../sentinel-trading-lab/agent/worker/signed-live-bridge.mjs';
const now=1800000000000;
const history=Array.from({length:600},(_,i)=>({ts:now-(599-i)*1000,price:100*Math.exp(i*.00001)}));
const forecast={engineId:'trend',side:'CALL',holdingSeconds:30,projectedEntryPrice:101,projectedExitPrice:102};
test('a persistent trend qualifies without requiring a cycle or reversion',()=>{
 const r=qualifyStrategyInterval({forecast,quoteHistory:history,asOf:now});
 assert.equal(r.side,'CALL');assert.equal(r.qualification.evidence,'trend');
 assert.equal(qualifyStrategyInterval({forecast:{...forecast,side:'PUT'},quoteHistory:history,asOf:now}).side,null);
});
test('warmup is explicit and future or late arriving quotes cannot supply evidence',()=>{
 const r=qualifyStrategyInterval({forecast,quoteHistory:history.slice(-30),asOf:now});
 assert.equal(r.status,'insufficient-selective-history');assert.equal(r.side,null);
 assert.deepEqual(strategyEvidence({quoteHistory:[...history,{ts:now+1000,price:500},{ts:now-1000,receivedAt:now+1000,price:1}],asOf:now}),strategyEvidence({quoteHistory:history,asOf:now}));
});
test('new continuous-mode entry crosses the signed bridge on the same market quote',()=>{
 let at=now;const sent=[];
 const b=new SignedLiveBridge('realtime:sentinel-'+'a'.repeat(48),'d'.repeat(64),{clock:()=>at});
 b.joined=true;b.verifiedViewerAt=at;b.socket={readyState:1,send:x=>sent.push(JSON.parse(x))};
 const frame=issued=>({v:1,at,seq:0,state:'running',lastEvalMs:now,settings:{engine:'automatic',forecastMode:'continuous',orderDurationMs:30000},liveBroker:{symbol:'TEST',lastQuoteAt:now},lastResult:{asset:'TEST',analysis:{vnext:{ea:[30,'CALL',101,102,issued,30]}}}});
 assert.equal(b.publish(frame(now)),true);at+=550;
 assert.equal(b.publish(frame(now+30000),{urgent:true}),true);
 assert.equal(sent.at(-1).payload.payload.lastResult.analysis.vnext.ea[4],now+30000);
 assert.ok(sent.at(-1).payload.payload.sig);b.close();
});
test('mobile accepts new evaluation independently of quote timestamp without rewinding price',()=>{
 const page=fs.readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 assert.doesNotMatch(page,/if\(Number\(payload.liveBroker\?\.lastQuoteAt\|\|0\)<prevPriceAt-250\)return previous/);
 assert.match(page,/if\(nextEval<prevEval\)return previous/);
 assert.match(page,/liveBroker:olderQuote\?previous.liveBroker/);
 assert.match(page,/feed:olderQuote\?previous.feed/);
});
