import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath as baseline} from './fixtures/sentinel-1392-causal-baseline.mjs';
import {causalForwardPath as candidate} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
const T=1791500000000, side=x=>x>0?'CALL':x<0?'PUT':'NEUTRAL';
function series(kind,length=950){
 const p=kind==='range-fast'?44:kind==='range-mid'?61:kind==='range-slow'?82:
  kind==='range-choppy'?55:70;
 const rows=[];let lp=Math.log(1.15);
 for(let i=0;i<length;i++){
  const drift=kind==='up'?.000005*i:kind==='down'?-.000005*i:
   kind==='turn'?(i<570?.000005*i:.000005*570-.00001*(i-570)):0;
  const amp=kind.startsWith('range')?.0007:0;
  const wave=amp*(Math.sin(2*Math.PI*i/p)+
   (kind==='range-choppy'?.4*Math.sin(2*Math.PI*i/29):0));
  const noise=.000006*Math.sin(i*1.77)+.000004*Math.cos(i*.39);
  rows.push({ts:T+i*1000,receivedAt:T+i*1000,price:Math.exp(lp+drift+wave+noise)});
 }
 return rows;
}
function matched(rows,lead=30){
 const out=[];
 // Score ONLY chronologically held-out future observations after
 // both models see the SAME quotes as-of the precise forecast instant.
 for(let i=470;i<rows.length-lead*2;i+=15){
  const history=rows.slice(0,i+1),now=rows[i].ts;
  const models=[['baseline',baseline],['candidate',candidate]].map(([name,fn])=>{
   const p=fn({quoteHistory:history,asOf:now,holdingSeconds:lead,maxSeconds:lead*2});
   if(p.status!=='causal-forward-path')return {name,status:p.status};
   const entry=p.priceAt(lead),exit=p.priceAt(2*lead);
   return {name,regime:p.regime,entry,exit,direction:side(exit-entry),
    windowLog:Math.log(exit/entry)};
  });
  if(models.some(x=>!x.direction))continue;
  const realized=side(rows[i+2*lead].price-rows[i+lead].price);
  out.push({time:now,regime:models[0].regime,realized,
   baseline:models[0],candidate:models[1]});
 }
 return out;
}
function summarize(items,regime=null){
 const a=regime?items.filter(x=>x.regime===regime):items;
 const oldCorrect=a.filter(x=>x.baseline.direction===x.realized).length;
 const newCorrect=a.filter(x=>x.candidate.direction===x.realized).length;
 return {samples:a.length,baselineCorrect:oldCorrect,candidateCorrect:newCorrect,
  baselineRate:a.length?oldCorrect/a.length:null,
  candidateRate:a.length?newCorrect/a.length:null};
}
test('range phase code MUST preserve every projected trend and reversal price',()=>{
 for(const kind of ['up','down','turn']){
  const rows=matched(series(kind),60);
  const unmodified=rows.filter(x=>x.regime!=='range');
  assert.ok(unmodified.length>=10,JSON.stringify({kind,total:rows.length,nonrange:unmodified.length}));
  for(const row of unmodified){
   assert.equal(row.baseline.entry,row.candidate.entry,kind);
   assert.equal(row.baseline.exit,row.candidate.exit,kind);
   assert.equal(row.baseline.regime,row.candidate.regime,kind);
  }
 }
});
test('multi-period range holdout compares only real entry-to-expiry moves',()=>{
 const kinds=['range-fast','range-mid','range-slow','range-choppy'];
 const summaries=kinds.flatMap(kind=>[30,60].map(lead=>{
  const rows=matched(series(kind),lead);
  const total=summarize(rows),range=summarize(rows,'range');
  // Every observation classified as TREND/REVERSAL must be bit-identical.
  for(const row of rows.filter(x=>x.regime!=='range')){
   assert.equal(row.baseline.entry,row.candidate.entry,kind+' '+lead);
   assert.equal(row.baseline.exit,row.candidate.exit,kind+' '+lead);
  }
  return {kind,lead,total,range};
 }));
 console.log('[1392 isolated RANGE model, SIMULATED quotes, NOT live accuracy] '+JSON.stringify(summaries));
 const recognized=summaries.filter(x=>x.range.samples>=4);
 // Expose the classifier blind spot, do not pretend every oscillation
 // was classified as range or assert synthetic accuracy is a live win rate.
 assert.ok(recognized.length>=4,JSON.stringify(summaries));
});
test('short recorded quote fixture remains honest about sample size',()=>{
 const data=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const rows=matched(data.quoteHistory,30);
 console.log('[1392 recorded quotes, ~180 seconds INSUFFICIENT] '+JSON.stringify({
  quotes:data.quoteHistory.length,evaluated:rows.length,result:summarize(rows)
 }));
 assert.equal(data.quoteHistory.length,180);
});
