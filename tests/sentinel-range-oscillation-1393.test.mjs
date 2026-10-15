import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {causalForwardPath as oldRangePhase} from './fixtures/sentinel-range-phase-v1-baseline.mjs';
import {causalForwardPath as newRangePhase} from '../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs';
import {causalForwardPath as production1392} from './fixtures/sentinel-1392-causal-baseline.mjs';
const T=1791500000000,side=x=>x>0?'CALL':x<0?'PUT':'NEUTRAL';
function series(kind,n=960){
 const rows=[];let t=0;
 for(let i=0;i<n;i++){
  const wave=(period,amp,phase=0)=>amp*Math.sin(2*Math.PI*i/period+phase);
  if(kind==='range-fast')t=wave(44,.0007);
  if(kind==='range-mid')t=wave(61,.0007);
  if(kind==='range-slow')t=wave(82,.0007);
  if(kind==='range-choppy')t=wave(55,.0007)+wave(29,.00028);
  if(kind==='range-triangle')t=.00075*(2/Math.PI)*Math.asin(Math.sin(2*Math.PI*i/59));
  if(kind==='range-drift')t=wave(62,.00065)+.0000003*i;
  if(kind==='range-multicycle')t=wave(78,.00054)+wave(38,.0002,.6);
  if(kind==='trend-up')t=i*.000007+wave(74,.00002);
  if(kind==='trend-down')t=-i*.000007+wave(71,.00002);
  if(kind==='trend-pullback')t=i*.000006+wave(83,.00004);
  if(kind==='trend-reversal')t=i<550?i*.000007:550*.000007-(i-550)*.000012;
  if(kind==='noise')t=wave(9,.00018)+wave(13,.00013)+wave(31,.00009);
  rows.push({ts:T+i*1000,receivedAt:T+i*1000,
   price:Math.exp(Math.log(1.1)+t+.000004*Math.sin(i*1.77))});
 }
 return rows;
}
function analyze(quotes,h){
 const counts={samples:0,phase1Wins:0,phase2Wins:0,prodWins:0,
  newlyRecognized:0,unchangedTrend:0,changedTrend:0,oldRange:0,newRange:0};
 for(let i=410;i<quotes.length-2*h;i+=12){
  const now=quotes[i].ts,q=quotes.slice(0,i+1),actual=side(quotes[i+2*h].price-quotes[i+h].price);
  const params={quoteHistory:q,asOf:now,holdingSeconds:h,maxSeconds:2*h};
  const old=oldRangePhase(params),next=newRangePhase(params),prod=production1392(params);
  if([old,next,prod].some(x=>x.status!=='causal-forward-path'))continue;
  const prediction=x=>side(x.priceAt(2*h)-x.priceAt(h));
  counts.samples++;
  if(prediction(old)===actual)counts.phase1Wins++;
  if(prediction(next)===actual)counts.phase2Wins++;
  if(prediction(prod)===actual)counts.prodWins++;
  if(old.regime==='range')counts.oldRange++;
  if(next.regime==='range')counts.newRange++;
  if(old.regime!=='range'&&next.regime==='range')counts.newlyRecognized++;
  if(next.regime!=='range'&&old.regime!=='range'){
   counts.unchangedTrend++;
   if(next.priceAt(h)!==old.priceAt(h)||next.priceAt(2*h)!==old.priceAt(2*h))
    counts.changedTrend++;
  }
 }
 return counts;
}
test('13.9.3 oscillation detector finds longer completed two-way swings',()=>{
 for(const kind of ['range-fast','range-mid','range-slow','range-choppy','range-triangle','range-drift','range-multicycle']){
  const s=analyze(series(kind),30);
  assert.ok(s.samples>=20,kind);
  assert.equal(s.changedTrend,0,kind);
  assert.ok(s.newRange>=s.oldRange,kind);
 }
});
test('13.9.3 30s/60s matched causal forward windows: prior vs newly recognized oscillations',()=>{
 const names=['range-fast','range-mid','range-slow','range-choppy','range-triangle','range-drift','range-multicycle',
  'trend-up','trend-down','trend-pullback','trend-reversal','noise'];
 const results=names.flatMap(kind=>[30,60].map(h=>({kind,h,...analyze(series(kind),h)})));
 console.log('[1393 matched SIMULATED windows; NOT real win rate] '+JSON.stringify(results));
 for(const row of results){
  assert.equal(row.changedTrend,0,row.kind+' '+row.h);
  assert.ok(row.samples>=20,row.kind+' '+row.h);
 }
 const ranges=results.filter(x=>x.kind.startsWith('range'));
 const initial=ranges.reduce((s,x)=>s+x.phase1Wins,0),next=ranges.reduce((s,x)=>s+x.phase2Wins,0);
 const newly=ranges.reduce((s,x)=>s+x.newlyRecognized,0);
 console.log('[1393 range SUMMARY] '+JSON.stringify({initial,next,newly,rangeSamples:ranges.reduce((s,x)=>s+x.samples,0)}));
 assert.ok(newly>=10,'slow oscillations still not being found');
 assert.ok(next>=initial,'range modification worsens matched simulated observations');
 // A significant directional leg with only shallow pullbacks must not be
 // silently reclassified as sideways. No absolute trade accuracy guarantee.
 for(const row of results.filter(x=>x.kind.startsWith('trend'))){
  assert.equal(row.newlyRecognized,0,row.kind+' '+row.h);
 }
});
test('real broker quote fixture is too short for statistically meaningful holdout',()=>{
 const data=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url)));
 const summary=analyze(data.quoteHistory,30);
 console.log('[1393 real 180s sample not representative] '+JSON.stringify(summary));
 assert.equal(data.quoteHistory.length,180);
});
test('no new permissions, timing gates, vetoes or dependence on the forming candle',()=>{
 const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
 const model=read('../sentinel-trading-lab/agent/src/core/causal-closed-structure-1379.mjs');
 const phase=read('../sentinel-trading-lab/agent/src/core/range-phase-trajectory-experimental.mjs');
 assert.match(model,/const observedOscillation=/);
 assert.match(model,/const range=!reversal/);
 assert.match(model,/last quoted instant of the FORMING bar/i);
 for(const s of [model,phase])assert.doesNotMatch(s,/brokerAllowsEntry|confirmationQuoteGapMs|cooldown|CALL AGORA|PUT AGORA/);
});
