import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {automaticChartContext} from '../sentinel-trading-lab/agent/src/core/automatic-chart-context.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';

// Fixed before examining this audit's outcomes: use the released classifier's
// existing mixed-range category. No outcome-trained threshold or phase label.
const selectedShape='mixed-range';
const prior=JSON.parse(readFileSync(new URL('../reports/sentinel-inverse-signal-audit-20261018.json',import.meta.url)));
const results=[];
for(const r of prior.results){
 const video=r.kind==='known-video';
 const file=video?r.name:'external/dukascopy-eurusd-'+r.name+'.json';
 const data=JSON.parse(readFileSync(new URL('../tests/fixtures/'+file,import.meta.url)));
 const quotes=video?data.quoteHistory:data.quotes;
 const entries=r.entries.map(e=>{
  // Reconstruct exactly the pre-override context used by released v17, using
  // its five-minute quote window. The classifier sees no outcomes or candles.
  const history=quotes.filter(q=>q.ts>=e.at-300000&&q.ts<=e.at&&Number(q.receivedAt??q.ts)<=e.at);
  assert.ok(history.some(q=>q.ts===e.at&&q.price===e.price),'Unverified entry quote');
  const input={quoteHistory:history,price:e.price,quoteAt:e.at,now:e.at,durationMs:30000};
  const base=analyzeNowOpportunity({...input,engineId:'automatic',qualityPolicy:'adaptive-market-v1'});
  const context=automaticChartContext({...input,base});
  // Check future and not-yet-received prices cannot affect classification.
  const poisoned=[...history,{ts:e.at+1,price:e.price*10,receivedAt:e.at+1},
   {ts:e.at-1,price:e.price*.1,receivedAt:e.at+1}];
  const poisonedInput={...input,quoteHistory:poisoned};
  const poisonedBase=analyzeNowOpportunity({...poisonedInput,engineId:'automatic',qualityPolicy:'adaptive-market-v1'});
  assert.deepEqual(automaticChartContext({...poisonedInput,base:poisonedBase}),context);
  const flipped=context.marketShape===selectedShape;
  const side=flipped?e.inverseSide:e.originalSide;
  const exit=expiryQuote(quotes,e.dueAt,video?undefined:data.metadata.expiryQuotePolicy);
  const result=!exit?'missing':exit.price===e.price?'tie':(exit.price>e.price?'CALL':'PUT')===side?'win':'loss';
  assert.equal(result,flipped?e.inverseResult:e.originalResult);
  assert.equal(e.dueAt-e.at,30000);
  return {...e,context,baseRegime:base.regime??null,baseReason:base.reason,
   flipped,conditionalSide:side,conditionalResult:result};
 });
 const measure=(es,key)=>metrics(es.map(e=>({...e,result:e[key]})));
 const shapes=Object.fromEntries([...new Set(entries.map(e=>e.context.marketShape))].sort().map(shape=>{
  const es=entries.filter(e=>e.context.marketShape===shape);
  return [shape,{entries:es.length,original:measure(es,'originalResult'),inverse:measure(es,'inverseResult')}];
 }));
 results.push({name:r.name,kind:r.kind,original:measure(entries,'originalResult'),
  conditional:measure(entries,'conditionalResult'),changed:entries.filter(e=>e.flipped).length,
  corrected:entries.filter(e=>e.flipped&&e.originalResult==='loss').length,
  spoiled:entries.filter(e=>e.flipped&&e.originalResult==='win').length,shapes,entries});
}
const external=results.filter(r=>r.kind==='external-market-replay-not-user-session');
const total=(rows,key)=>{const t={win:0,loss:0,tie:0,missing:0};
 for(const r of rows)for(const k of Object.keys(t))t[k]+=r[key][k];
 return {...t,completed:t.win+t.loss,winRate:t.win+t.loss?t.win/(t.win+t.loss):null};};
const selected=external.flatMap(r=>r.entries.filter(e=>e.flipped));
const selectedTotal=key=>{const m=metrics(selected.map(e=>({...e,result:e[key]})));delete m.maxLossStreak;return m;};
const summary={externalWindows:external.length,externalOriginal:total(external,'original'),
 externalConditional:total(external,'conditional'),
 externalSelected:{entries:selected.length,original:selectedTotal('originalResult'),inverse:selectedTotal('inverseResult')},
 externalImprovedWindows:external.filter(r=>r.conditional.win>r.original.win).length,
 externalWorsenedWindows:external.filter(r=>r.conditional.win<r.original.win).length,
 videoExtractions:results.filter(r=>r.kind==='known-video').map(({entries,...r})=>r),
 externalWindowResults:external.map(({entries,...r})=>r)};
const moduleFile=new URL('../sentinel-trading-lab/agent/src/core/automatic-chart-context.mjs',import.meta.url);
const report={spec:{productionReference:prior.spec.productionReference,selectedShape,
 classifierSha256:createHash('sha256').update(readFileSync(moduleFile)).digest('hex'),
 method:'Keep released entries, prices and deadlines. Reconstruct released pre-override automaticChartContext at entry using causal v1 base and five-minute quote history. Reverse CALL/PUT only when marketShape is mixed-range; otherwise preserve it. Rescore against source quotes.',
 caveats:[...prior.spec.caveats,
 'mixed-range means low directional efficiency away from historical extremes in this existing classifier. It does not establish periodic oscillation or the next turning point.',
 'This audits the pre-override market context, not the final historical-level display label. No candidate runtime was deployed.',
 'All these windows were already inspected before this hypothesis; this is exploratory, not independent validation.']},summary,results};
writeFileSync(new URL('../reports/sentinel-range-inverse-audit-20261018.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
