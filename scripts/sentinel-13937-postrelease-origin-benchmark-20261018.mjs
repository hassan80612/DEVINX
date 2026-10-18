// Post-publication diagnosis only. No new predictor or production rule.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const release=JSON.parse(readFileSync(new URL('../sentinel-trading-lab/agent/release.json',import.meta.url)));
assert.equal(release.version,'13.9.37');
const sources=[];
for(const set of ['development','available-holdout']){
 const prior=JSON.parse(readFileSync(new URL('../reports/sentinel-binary-objective-ab-20261018-'+set+'.json',import.meta.url)));
 for(const r of prior.results){
  if(r.kind==='known-video'&&r.name!=='sentinel-user-video-broker-6dp-20261016.json')continue;
  sources.push(r);
 }
}
const realNow=Date.now,results=[];
const rules=['last-observed-tick','past-5s-direction','past-20s-direction'];
try{
 for(const previous of sources){
  const video=previous.kind==='known-video';
  const filename=video?previous.name:'external/dukascopy-eurusd-'+previous.name+'.json';
  const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+filename,import.meta.url)));
  const d=video?{quotes:f.quoteHistory,asset:f.asset,metadata:{name:previous.name,kind:previous.kind}}:f;
  const replay=simulate(d,{Runtime:[DemoTradingRuntime,DemoTradingRuntime],selectors:[null,null]});
  assert.deepEqual(replay.entries[0],previous.entries[3],'Published modules differ from the tested combined candidate');
  assert.equal(replay.sameEntries,true,'Unmodified duplicate runtimes differ');
  const entries=replay.entries[0].map((e,i)=>{
   const reason=replay.entryReasons[0][i];assert.equal(reason.at,e.at);
   const history=d.quotes.filter(q=>q.ts<e.at&&Number(q.receivedAt??q.ts)<=e.at);
   const naive=Object.fromEntries(rules.map(rule=>{
    const target=rule==='last-observed-tick'?e.at:rule==='past-5s-direction'?e.at-5000:e.at-20000;
    const origin=history.findLast(q=>q.ts<=target);
    if(!origin||target-origin.ts>2500)return [rule,{side:null,result:'unavailable'}];
    const side=e.price>origin.price?'CALL':e.price<origin.price?'PUT':null;
    if(!side)return [rule,{side:null,result:'unavailable'}];
    const result=side===e.side?e.result:e.result==='win'?'loss':e.result==='loss'?'win':e.result;
    return [rule,{side,result,originAt:origin.ts,originPrice:origin.price}];
   }));
   return {...e,reason:reason.reason,naive};
  });
  results.push({name:previous.name,kind:previous.kind,production:metrics(entries),entries});
 }
}finally{Date.now=realNow;}
const group=rows=>{
 const production=metrics(rows);
 const byOrigin=Object.fromEntries([...new Set(rows.map(e=>e.reason))].sort().map(reason=>{
  const selected=rows.filter(e=>e.reason===reason);
  return [reason,metrics(selected)];
 }));
 const baselines=Object.fromEntries(rules.map(rule=>{
  const matched=rows.filter(e=>e.naive[rule].side);
  return [rule,{matched:matched.length,unavailable:rows.length-matched.length,
   productionOnSameEntries:metrics(matched),baselineOnSameEntries:metrics(matched.map(e=>({...e,result:e.naive[rule].result})))}];
 }));
 return {production,byOrigin,baselines};
};
const external=results.filter(r=>r.kind!=='known-video');
// Do not manufacture a chronological loss streak by concatenating windows
// in file order; only individual window metrics define a real streak.
const withoutAggregateStreak=g=>{delete g.production.maxLossStreak;
 for(const m of Object.values(g.byOrigin))delete m.maxLossStreak;
 for(const b of Object.values(g.baselines)){delete b.productionOnSameEntries.maxLossStreak;delete b.baselineOnSameEntries.maxLossStreak;}
 return g;};
const summary={externalWindows:external.length,external:withoutAggregateStreak(group(external.flatMap(r=>r.entries))),
 video:results.filter(r=>r.kind==='known-video').map(r=>({name:r.name,...group(r.entries)})),
 externalByDay:Object.fromEntries(['2020-03-30','2020-03-31'].map(day=>{
  const selected=external.filter(r=>day==='2020-03-31'?r.name.startsWith('available-official-'):!r.name.startsWith('available-official-'));
  return [day,withoutAggregateStreak(group(selected.flatMap(r=>r.entries)))];
 }))};
const report={spec:{productionReference:'21f43a9587e2a4f6cdb23933226b4b0f0520e466',build:release.build,
 purpose:'After publication, attribute actual 13.9.37 entries to their final admission reasons and compare fixed simple causal directions on exactly matching entry times/prices/deadlines. No model tuning, filtering, side override or live trade.',
 rules,referenceToleranceMs:2500,
 caveats:['All evaluated windows are already inspected research data, not an untouched holdout.',
 'External Forex, not user broker OTC, actual trades, profits or account accuracy.',
 'The known video has limited extracted quotes and no verified historical candles.',
 'Each simple baseline reports the SAME subset of original entries for both models; zero/unavailable past movement abstains and is reported, not scored as a loss.',
 'Outcome scoring and immutable entry times are unchanged. A better retrospective subgroup or baseline is diagnostic, not a validated replacement strategy.']},summary,results};
writeFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
