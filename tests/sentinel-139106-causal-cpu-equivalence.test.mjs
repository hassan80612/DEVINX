import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {completedRangeStructure as before,analyzeNowOpportunity as beforeNow} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.baseline.mjs';
import {completedRangeStructure as after,analyzeNowOpportunity as afterNow} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url),'utf8'));
const measured=fixture.quoteHistory;
const t0=1800000000000;
function synthetic(kind,seconds=140,resolution=250){
 const q=[];
 for(let ms=0;ms<=seconds*1000;ms+=resolution){
  const t=ms/1000;
  let p=100;
  if(kind==='range')p+=.2*Math.sin(t*.20)+.05*Math.sin(t*.83);
  else if(kind==='trend')p+=t*.006+.02*Math.sin(t*.35);
  else if(kind==='turn')p+=t<70?t*.009:.63-(t-70)*.008;
  else if(kind==='flat')p+=Math.sin(t)*.00005;
  else p+=Math.sin(t*.45)*.04;
  q.push({ts:t0+ms,receivedAt:t0+ms,price:p});
 }
 return q;
}
function compare(rows,now,hold=30000,noise=.0002){
 const asOf=rows.filter(q=>q.ts<=now);
 const price=asOf.at(-1)?.price||0;
 assert.deepEqual(after(asOf,now,noise,price,hold),
                  before(asOf,now,noise,price,hold));
}
test('identical market-range model results for real recorded broker quote tape',()=>{
 const tStart=measured[0].ts;
 for(let second=90;second<=550;second+=5){
  const now=tStart+second*1000;
  for(const durationMs of [5000,15000,30000,60000,120000,300000])
   compare(measured,now,durationMs,1e-6);
 }
});
test('identical direction and range judgments for turning, trending, choppy and flat markets',()=>{
 for(const kind of ['range','trend','turn','flat','oscillation']){
  const rows=synthetic(kind);
  for(let t=50000;t<=139000;t+=1750){
   const now=t0+t,filtered=rows.filter(q=>q.ts<=now);
   for(const horizon of [5000,15000,30000,60000,120000,300000]){
    compare(filtered,now,horizon,1e-5);
    const p=filtered.at(-1).price,opts={quoteHistory:filtered,now,
      quoteAt:filtered.at(-1).ts,price:p,durationMs:horizon,
      engineId:'automatic',qualityPolicy:'baseline'};
    assert.deepEqual(afterNow(opts),beforeNow(opts),kind+' '+t+' '+horizon);
   }
  }
 }
});
test('same results with stale quotes, missing windows and one-sided gaps',()=>{
 const clean=synthetic('range');
 for(const step of [2,3,7,10,14]){
  const q=clean.filter((x,i)=>i%step!==0);
  for(const now of [t0+111000,t0+130000,t0+138000])
   compare(q,now,60000,.0005);
 }
});
test('CPU-only optimization benchmark for a dense 5-minute tape',()=>{
 const rows=synthetic('range',300,100);
 const stamps=Array.from({length:80},(_,i)=>t0+165000+i*1550);
 const execute=fn=>{
  const started=process.hrtime.bigint();
  for(let rep=0;rep<10;rep++)for(const stamp of stamps){
   const spot=rows[Math.round((stamp-t0)/100)].price;
   fn(rows,stamp,.0003,spot,60000);
  }
  return Number(process.hrtime.bigint()-started)/1e6;
 };
 execute(before);execute(after);
 const beforeMs=execute(before),afterMs=execute(after);
 console.log(JSON.stringify({baselineMs:+beforeMs.toFixed(2),
  optimizedMs:+afterMs.toFixed(2),speedup:+(beforeMs/afterMs).toFixed(2),
  calls:stamps.length*10}));
 assert.ok(afterMs>0&&beforeMs>0);
});
