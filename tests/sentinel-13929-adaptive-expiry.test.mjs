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
test('production wide search is the exact wider-cycle candidate evaluated in research',()=>{
 const video=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url))).quoteHistory;
 for(const i of [200,400,650,950]){
  const q=video[i],args={quoteHistory:video.slice(0,i+1),quoteAt:q.ts,now:q.ts,price:q.price,durationMs:30000};
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
test('actual engine integration exactly matches the measured selector and preserves every entry timestamp',()=>{
 const history=Array.from({length:540},(_,i)=>({ts:T+i*1000,price:Math.exp(.000024*(45-Math.abs(i%180-90))+.00025*Math.sin(i*2*Math.PI/13+.2))}));
 const live=new CompletedExpiryDirection(),study=new CompletedOutcomeSelector(),states={},entries={base:[],production:[],study:[]};
 for(let i=0;i<history.length;i++){
  const q=history[i],args={quoteHistory:history.slice(0,i+1),quoteAt:q.ts,price:q.price,now:q.ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'};
  const baseline=analyzeNowOpportunity(args),wide=baseline.ready?wideBandCycleForecast(args):null;
  const expected=study.observe({rows:args.quoteHistory,now:q.ts,price:q.price,base:baseline,alternative:wide?.ready?{...baseline,...wide}:baseline});
  const actual=analyzeNowOpportunity({...args,expiryDirectionSelector:live,expiryDirectionContext:'IQ|EUR|30|current'});
  assert.equal(actual.side,expected.side);assert.equal(actual.ready,baseline.ready);
  for(const [name,candidate]of [['base',baseline],['production',actual],['study',expected]]){
   const next=advanceNowOpportunity({previous:states[name],candidate,now:q.ts,quoteAt:q.ts,asset:'EUR',engineId:'automatic',durationMs:30000});
   if(next.phase==='fired'&&next.entryTriggeredAt!==states[name]?.entryTriggeredAt)entries[name].push({at:q.ts,side:next.side});
   if(states[name]?.phase==='fired'&&q.ts<states[name].exitAt)assert.equal(next.side,states[name].side);
   states[name]=next;
  }
 }
 assert.deepEqual(entries.production,entries.study);
 assert.deepEqual(entries.production.map(e=>e.at),entries.base.map(e=>e.at));
 assert.ok(entries.production.some((e,i)=>e.side!==entries.base[i].side));
});
