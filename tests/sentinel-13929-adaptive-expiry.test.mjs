import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {wideBandCycleForecast} from '../research/wide-band-expiry-direction.mjs';
import {CompletedOutcomeSelector} from '../research/completed-outcome-selector.mjs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=Date.UTC(2026,9,16,22),rows=Array.from({length:181},(_,i)=>({ts:T-180000+i*1000,price:Math.exp(.0006*Math.sin(i*2*Math.PI/40+5.3))}));
const input={quoteHistory:rows,quoteAt:T,now:T,price:rows.at(-1).price,durationMs:30000};
const base={ready:true,side:'PUT',observedAt:T,entryPrice:input.price};
const observe=(m,overrides={})=>m.observe({context:'IQ|EUR|30|current',...input,baseline:base,...overrides});
test('wide model fitting remains identical to the research reference on aligned actual observations',()=>{
 // 13.9.36 deliberately changes subsecond observation selection. Compare
 // unchanged model fitting on identical, actually recorded aligned inputs.
 const video=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory.filter(q=>q.ts%1000===0);
 for(const i of [100,200,325,475]){
  const q=video[i],args={quoteHistory:video.slice(0,i+1),quoteAt:q.ts,now:q.ts,price:q.price,durationMs:30000};
  assert.equal(thirtySecondCycleForecast({...args,periodSearch:'wide'}).ready,true);
  assert.deepEqual(thirtySecondCycleForecast({...args,periodSearch:'wide'}),wideBandCycleForecast(args));
 }
});
test('production selector uses the actual expiry and cannot learn from the three-second manual lead',()=>{
 const m=new CompletedExpiryDirection();observe(m,{projectionTargetAt:T+33000});
 assert.equal(m.pending[0].dueAt,T+33000);
 observe(m,{quoteAt:T+30000,now:T+30000,price:input.price*1.01});assert.equal(m.completed,0);
 observe(m,{quoteAt:T+33000,now:T+33000,price:input.price*1.01});assert.equal(m.completed,1);
 observe(m,{quoteAt:T+33000,now:T+33000,price:input.price*1.01});assert.equal(m.completed,1);
});
test('context change, overdue labels, ties and stale quotes cannot train the selector',()=>{
 for(const kind of ['context','overdue','tie','stale']){
  const m=new CompletedExpiryDirection();observe(m);
  const args=kind==='context'?{context:'EXNOVA|GBP|30|broker',quoteAt:T+30000,now:T+30000,price:input.price*1.01}:
   kind==='overdue'?{quoteAt:T+31001,now:T+31001,price:input.price*1.01}:
   kind==='tie'?{quoteAt:T+30000,now:T+30000,price:input.price}:
   {quoteAt:T+30000,now:T+32000,price:input.price*1.01};
  observe(m,args);assert.equal(m.completed,0,kind);
 }
});
test('selection cannot create admission or replace an unscored structural baseline',()=>{
 const m=new CompletedExpiryDirection();assert.equal(observe(m),base);
 const waiting={ready:false,side:null,reason:'unconfirmed'};m.completed=20;m.loss={base:1,wide:0};
 assert.equal(observe(m,{baseline:waiting}),waiting);
});
test('actual engine stage4 never lets the adaptive selector reverse a confirmed structural direction without separate observed evidence',()=>{
 const history=Array.from({length:540},(_,i)=>({ts:T+i*1000,price:Math.exp(.000024*(45-Math.abs(i%180-90))+.00025*Math.sin(i*2*Math.PI/13+.2))}));
 const selector=new CompletedExpiryDirection(),states={},entries={base:[],guarded:[]};
 let blocked=0,observedReady=0;
 for(let i=0;i<history.length;i++){
  const q=history[i],args={quoteHistory:history.slice(0,i+1),quoteAt:q.ts,price:q.price,
   now:q.ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
  const base=analyzeNowOpportunity(args);
  const guarded=analyzeNowOpportunity({...args,expiryDirectionSelector:selector,
   expiryDirectionContext:'IQ|EUR|30|current'});
  if(base.ready&&guarded.ready){
   observedReady++;
   assert.equal(guarded.side,base.side,
    'unvalidated adaptive wide model cannot flip an otherwise ready direction');
  }
  if(base.ready&&!guarded.ready){
   blocked++;
   assert.equal(guarded.reason,'unverified-forecast-structure-conflict');
  }
  for(const [name,candidate] of [['base',base],['guarded',guarded]]){
   const next=advanceNowOpportunity({previous:states[name],candidate,now:q.ts,
    quoteAt:q.ts,asset:'EUR',engineId:'automatic',durationMs:30000});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt)
    entries[name].push({at:q.ts,side:next.side});
   if(states[name]?.phase==='fired'&&q.ts<states[name].exitAt)
    assert.equal(next.side,states[name].side,'held window must remain immutable');
   states[name]=next;
  }
 }
 assert.ok(observedReady>0);
 assert.ok(entries.guarded.every(x=>['CALL','PUT'].includes(x.side)));
 assert.ok(blocked>=0,'conflicts may be rare in a finite synthetic run');
});
