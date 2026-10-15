import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=Date.UTC(2026,9,1);
const recorded=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8')).quoteHistory;
function quotes(kind,period=48){
 return Array.from({length:540},(_,i)=>{
  const ts=T+i*1000;
  const log=Math.log(1.082)+(kind==='up'?i*.000011:kind==='down'?-i*.000011:
    kind==='range'?.00068*Math.sin(2*Math.PI*i/period):
    kind==='choppy'?.00064*(Math.sin(i*2*Math.PI/37)+.35*Math.sin(i*2*Math.PI/17)):0)+
    .000009*Math.sin(i*1.73)+.000006*Math.cos(i*.45);
  return{ts,receivedAt:ts,price:Math.exp(log)};
 });
}
function evaluate(source,holdingMs){
 let state=null,signals=[];
 for(let i=0;i<source.length;i++){
  const q=source[i],seen=source.slice(0,i+1),candidate=analyzeNowOpportunity({
   quoteHistory:seen,price:q.price,quoteAt:q.ts,now:q.ts,durationMs:holdingMs
  });
  const next=advanceNowOpportunity({previous:state,candidate,now:q.ts,quoteAt:q.ts,
   asset:'TEST',engineId:'automatic',durationMs:holdingMs});
  if(next.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt){
   if(signals.length)assert.ok(next.entryTriggeredAt>=signals.at(-1).exitAt,'overlap');
   const last=source.find(x=>x.ts>=next.exitAt&&x.ts<=next.exitAt+1000);
   signals.push({at:q.ts,side:next.side,origin:candidate.reason,exitAt:next.exitAt,
    result:last?(next.side==='CALL'?last.price>q.price:last.price<q.price):null});
  }
  state=next;
 }
 return {signals,evaluated:signals.filter(x=>x.result!==null),
  wins:signals.filter(x=>x.result===true).length};
}
test('sustained rising and falling markets keep immediate opportunities',()=>{
 for(const side of ['up','down']){
  const out=evaluate(quotes(side),30000);
  assert.ok(out.evaluated.length>=14,side);
  assert.equal(out.wins,out.evaluated.length,side);
  assert.ok(out.signals.every(s=>s.side===(side==='up'?'CALL':'PUT')));
 }
});
test('confirmed upper/lower range turns are not momentum-following calls at extremes',()=>{
 const out=evaluate(quotes('range',48),30000);
 const reversals=out.signals.filter(x=>x.origin==='closed-range-extreme-reversal-confirmed');
 assert.ok(reversals.length>=8,JSON.stringify(out.signals));
 assert.ok(out.evaluated.length>=8);
 assert.ok(out.wins>=8,JSON.stringify(out));
});
test('30s option cannot be treated as the short half-swing in 24s range',()=>{
 const out=evaluate(quotes('range',24),30000);
 assert.ok(out.signals.length<=1,JSON.stringify(out.signals));
});
test('long expiry does not follow the short confirmed oscillation',()=>{
 const out=evaluate(quotes('range',48),60000);
 assert.equal(out.signals.length,0);
});
test('irregular multi-cycle ranges do not create phantom trend breaks',()=>{
 const out=evaluate(quotes('choppy'),30000);
 assert.equal(out.signals.length,0);
});
test('previously recorded descending broker quotes remain causal and unblocked',()=>{
 const out=evaluate(recorded,30000);
 assert.equal(out.evaluated.length,3);
 assert.equal(out.wins,3);
 assert.equal(out.signals.length,4);
});
