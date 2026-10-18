import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const cases=new Map();
for(const file of ['sentinel-ordered-rejection-ab-20261017-development.json','sentinel-ordered-rejection-ab-20261017-holdout.json']){
 const r=JSON.parse(readFileSync(new URL('../reports/'+file,import.meta.url)));
 for(const x of r.results){assert.ok(!cases.has(x.name),'Duplicate window');cases.set(x.name,x);}
}
const results=[];
for(const [name,r] of cases){
 const video=r.kind==='known-video',file=video?name:'external/dukascopy-eurusd-'+name+'.json';
 const f=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url))),quotes=video?f.quoteHistory:f.quotes;
 const entries=r.entries[0].map(e=>{
  const exit=expiryQuote(quotes,e.dueAt,video?undefined:f.metadata.expiryQuotePolicy);
  const score=side=>!exit?'missing':exit.price===e.price?'tie':(exit.price>e.price?'CALL':'PUT')===side?'win':'loss';
  const originalResult=score(e.side),inverseSide=e.side==='CALL'?'PUT':'CALL',inverseResult=score(inverseSide);
  assert.equal(originalResult,e.result,'Saved baseline outcome differs from source scorer');
  assert.equal(inverseResult,originalResult==='win'?'loss':originalResult==='loss'?'win':originalResult);
  return {at:e.at,dueAt:e.dueAt,price:e.price,originalSide:e.side,inverseSide,
   exitQuoteAt:exit?.ts??null,exitQuotePrice:exit?.price??null,originalResult,inverseResult};
 });
 const original=metrics(entries.map(e=>({...e,result:e.originalResult}))),inverse=metrics(entries.map(e=>({...e,result:e.inverseResult})));
 assert.deepEqual(original,r.metrics[0]);
 results.push({name,kind:r.kind,original,inverse,entries});
}
const external=results.filter(x=>x.kind==='external-market-replay-not-user-session');
const totals=which=>{
 const t={win:0,loss:0,tie:0,missing:0};for(const r of external)for(const k of Object.keys(t))t[k]+=r[which][k];
 return {...t,completed:t.win+t.loss,winRate:t.win/(t.win+t.loss)};
};
const summary={externalWindows:external.length,externalOriginal:totals('original'),externalInverse:totals('inverse'),
 videoExtractions:results.filter(x=>x.kind==='known-video').map(({entries,...r})=>r),
 externalWindowResults:external.map(({entries,...r})=>r)};
const report={spec:{productionReference:'a6e810400ecf1d909293d80818aa6282f5e81569',
 method:'Rescore the same original 13.9.36 entry times, entry bid and 30s deadlines from source quotes. Reverse CALL/PUT only; do not change engine timing, admission or learning. Ties/missing remain unchanged.',
 caveats:['One already inspected external EUR/USD Forex day in 2020, not the user broker/OTC session, live accuracy or actual settlements.',
 'The two video extractions describe one known source and must not be aggregated as independent sessions.',
 'No inverse operations were executed and no production code or deployment was changed.']},summary,results};
writeFileSync(new URL('../reports/sentinel-inverse-signal-audit-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
