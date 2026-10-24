import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proveLevelRejectionAtExpiry} from '../sentinel-trading-lab/agent/src/core/causal-level-rejection-proof.mjs';
import {applyHistoricalPriceStructure} from '../sentinel-trading-lab/agent/src/core/historical-price-structure.mjs';

const NOW=1800000000000;
const D=[5000,15000,30000,60000,120000,300000];
const path=(seconds,priceAt)=>Array.from({length:seconds+1},(_,i)=>({
 ts:NOW-(seconds-i)*1000,receivedAt:NOW-(seconds-i)*1000,price:priceAt(i,seconds)
}));
const args=(ticks,durationMs,side='CALL',extras={})=>({
 quoteHistory:ticks,quoteAt:NOW,now:NOW,price:ticks.at(-1).price,durationMs,
 side,zone:{level:side==='CALL'?99.8:100.2,confirmedPivots:2,independentRejections:1},
 tolerance:.04,atr:.4,...extras
});
test('all six expiration windows can validate an actually sustained level departure',()=>{
 for(const d of D){
  const hold=d/1000,seconds=Math.max(hold,90),ticks=path(seconds,(i,n)=>99.8+i*.012);
  const a=proveLevelRejectionAtExpiry(args(ticks,d));
  assert.equal(a.confirmed,true,JSON.stringify({d,a}));
  const puts=ticks.map(x=>({...x,price:200-x.price}));
  const b=proveLevelRejectionAtExpiry(args(puts,d,'PUT',{
   zone:{level:100.2,confirmedPivots:2,independentRejections:0}
  }));
  assert.equal(b.confirmed,true,JSON.stringify({d,b}));
 }
});
test('short 2-6s bounce in longer descending market is never sold as a sustained reversal',()=>{
 for(const d of D){
  const seconds=Math.max(90,d/1000),ticks=path(seconds,(i,n)=>{
   const secondsAgo=n-i;
   return secondsAgo>6?101+(secondsAgo-6)*.02:101.0+(6-secondsAgo)*.005;
  });
  const a=proveLevelRejectionAtExpiry(args(ticks,d,'CALL',
   {zone:{level:100.8,confirmedPivots:3}}));
  if(d>=30000)assert.equal(a.confirmed,false,JSON.stringify({d,a}));
 }
});
test('old strong market reaction is not accepted on a single last-second noise tick',()=>{
 for(const d of D){
  const seconds=Math.max(90,d/1000),ticks=path(seconds,(i,n)=>99.8+i*.012);
  ticks[ticks.length-1]={...ticks.at(-1),price:ticks.at(-2).price-.015};
  const a=proveLevelRejectionAtExpiry(args(ticks,d));
  assert.equal(a.confirmed,false,JSON.stringify({d,a}));
 }
});
test('a missing horizon, gap or future-only packet cannot fabricate evidence',()=>{
 for(const d of D){
  const seconds=Math.max(90,d/1000),q=path(seconds,(i)=>100+i*.012);
  const pastWindow=({5000:2,15000:4,30000:6,60000:10,120000:15,300000:20})[d];
  const removed=q.filter(x=>x.ts<NOW-pastWindow*1000-4000||x.ts>NOW-pastWindow*1000+4000);
  const a=proveLevelRejectionAtExpiry(args(removed,d));
  if(d>=30000)assert.equal(a.confirmed,false,JSON.stringify({d,a}));
  const future=q.map(x=>({...x,receivedAt:x.ts>=NOW-3000?NOW+1000:x.receivedAt}));
  assert.equal(proveLevelRejectionAtExpiry(args(future,d)).confirmed,false);
 }
});
test('a historical level rejection cannot create a new entry when expiry proof fails',()=>{
 const seconds=120,quotes=path(seconds,(i,n)=>{
  const ago=n-i;
  return ago>6?100.08+(ago-6)*.0015:
   ago>3?100.08-(6-ago)*.027:99.999+(3-ago)*.02;
 });
 const input={ready:false,side:null,reason:'not-ready'};
 const zone={level:100,low:99.98,high:100.02,confirmedPivots:2,
  independentRejections:2,touches:6,pivots:2,ages:[1,3]};
 const structure={candles:80,periodMs:60000,atr:.4,tolerance:.04,
  averages:[{value:100.12,slope:-.001,period:20}],zones:[zone]};
 const result=applyHistoricalPriceStructure({candidate:input,structure,
  quoteHistory:quotes,quoteAt:NOW,now:NOW,price:quotes.at(-1).price,durationMs:60000});
 assert.notEqual(result.reason,'historical-level-rejection');
 assert.equal(result.ready,false);
});
test('an independently confirmed continuation is retained if a provisional level bounce disagrees',()=>{
 const quotes=path(90,(i,n)=>n-i>6?100.05+(n-i-6)*.002:
  n-i>3?100.05-(6-(n-i))*.025:99.975+(3-(n-i))*.025);
 const structure={candles:80,periodMs:60000,atr:.4,tolerance:.04,
  averages:[{period:20,value:100,slope:-.01}],zones:[
   {level:100,low:99.98,high:100.02,confirmedPivots:2,
    independentRejections:2,touches:4,pivots:2,ages:[0,2]}]};
 const c={ready:true,side:'PUT',reason:'independent-confirmed-trend'};
 const got=applyHistoricalPriceStructure({candidate:c,structure,
  quoteHistory:quotes,quoteAt:NOW,now:NOW,price:quotes.at(-1).price,durationMs:60000});
 assert.equal(got.side,'PUT');
 assert.equal(got.ready,true);
});
test('the proof never requests browser state, changes expiry, schedules waits or fabricates win probability',()=>{
 const s=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/causal-level-rejection-proof.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/fetch\s*\(|page\.|playwright|setTimeout|setInterval|await\b|netPnl|brokerSettlement/);
 for(const d of D){
  const q=path(Math.max(90,d/1000),(i)=>99.8+i*.01);
  const result=proveLevelRejectionAtExpiry(args(q,d));
  for(const key of ['pWin','profit','winRate','estimatedPayout'])
   assert.equal(Object.hasOwn(result,key),false);
 }
});

test('same-tick real trade audit persists bounded reaction evidence without blocking broker',async()=>{
 const {decisionAudit}=await import('../sentinel-trading-lab/agent/worker/trade-audit.mjs');
 const signal={id:'test|market|automatic|60000|'+NOW,side:'CALL',at:NOW,
   durationMs:60000,entryPrice:100.3,auditEvidence:{
    source:'now-structural-v1',signalAt:NOW,finalSide:'CALL',
    finalReason:'historical-level-rejection',levelReaction:'rejection',
    levelExpiryProof:{confirmed:true,reason:'causal-multihorizon-followthrough',
      durationMs:60000,moves:[.1,.2,.3]}
   }};
 const x=decisionAudit({signal,context:{provider:'iq_option',asset:'SYNTHETIC',
   engine:'automatic',analysis:{}},mode:'automatic',martingaleLevel:0,clickCount:1,now:NOW});
 assert.equal(x.structure.levelExpiryProof.confirmed,true);
 assert.equal(x.structure.levelExpiryProof.durationMs,60000);
 assert.deepEqual(x.structure.levelExpiryProof.moves,[.1,.2,.3]);
 assert.equal(x.structure.reason,'historical-level-rejection');
 assert.equal(JSON.stringify(x).includes('password'),false);
});
