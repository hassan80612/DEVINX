import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

function market(type,end,length=185){
 const start=end-(length-1)*1000;
 return Array.from({length},(_,i)=>{
  const ts=start+i*1000,trend=i*.000005;
  const wave=.00030*Math.sin(i*.17)+.00010*Math.cos(i*.39);
  return {ts,receivedAt:ts,price:1.12+(type==='up'?trend:type==='down'?-trend:type==='range'?wave:wave*.3+trend*.24)};
 });
}
test('30s adaptive path does not override closed structural side, WAIT or readiness',()=>{
 const T=1800000000000;
 for(const type of ['up','down','range','mixed']){
  const all=market(type,T);
  for(let i=100;i<185;i+=5){
   const rows=all.slice(0,i+1),q=rows.at(-1);
   const args={quoteHistory:rows,quoteAt:q.ts,price:q.price,now:q.ts+125,durationMs:30000,engineId:'automatic'};
   const structural=analyzeNowOpportunity(args);
   const candidate=analyzeNowOpportunity({...args,qualityPolicy:'adaptive-market-v17'});
   assert.equal(candidate.ready,structural.ready,type+' '+i);
   assert.equal(candidate.side,structural.side,type+' '+i);
   assert.equal(candidate.reason,structural.reason,type+' '+i);
  }
 }
});
test('Existing one-shot cycle remains exactly 30s and next fresh signal is immediate',()=>{
 const T=1800000000000;
 const start=advanceNowOpportunity({candidate:{ready:true,side:'CALL',entryPrice:1.1,observedAt:T},quoteAt:T,now:T+100,asset:'PAIR',durationMs:30000});
 assert.equal(start.exitAt,T+30100);
 const lock=advanceNowOpportunity({previous:start,candidate:{ready:true,side:'PUT',entryPrice:1.09,observedAt:T+20000},quoteAt:T+20000,now:T+20100,asset:'PAIR',durationMs:30000});
 assert.equal(lock.side,'CALL');assert.equal(lock.entryReadyNow,false);
 const again=advanceNowOpportunity({previous:lock,candidate:{ready:true,side:'PUT',entryPrice:1.09,observedAt:T+30200},quoteAt:T+30200,now:T+30300,asset:'PAIR',durationMs:30000});
 assert.equal(again.side,'PUT');assert.equal(again.exitAt,T+60300);
});
