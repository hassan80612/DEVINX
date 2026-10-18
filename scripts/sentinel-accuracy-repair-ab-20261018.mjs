import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DemoTradingRuntime as Base} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {orderedRejectionResearchRuntime} from '../experiments/ordered-rejection-research-runtime-20261017.mjs';
import {finalRouteCalibrationRuntime} from '../experiments/final-route-calibration-runtime-20261018.mjs';
import assert from 'node:assert/strict';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const mode=process.env.SENTINEL_REPAIR_SET??'known';if(!['known','unseen','crypto'].includes(mode))throw Error('unknown set');
const spec=JSON.parse(readFileSync(new URL('../reports/sentinel-accuracy-repair-spec-20261018.json',import.meta.url)));
const names=mode==='crypto'?JSON.parse(readFileSync(new URL('../reports/sentinel-accuracy-repair-binance-data-20261018.json',import.meta.url))).windows.map(r=>r.name):mode==='known'?JSON.parse(readFileSync(new URL('../reports/sentinel-13937-postrelease-origin-benchmark-20261018.json',import.meta.url))).results.filter(r=>r.kind!=='known-video').map(r=>r.name):JSON.parse(readFileSync(new URL('../reports/sentinel-accuracy-repair-data-20261018.json',import.meta.url))).windows.map(r=>r.name);
const c=await orderedRejectionResearchRuntime(),cal=await finalRouteCalibrationRuntime(),realNow=Date.now,results=[];
try{
 for(const name of names){
  const bytes=readFileSync(new URL('../tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json',import.meta.url)),d=JSON.parse(bytes);const r=simulate(d,{Runtime:[Base,c.DemoTradingRuntime,cal.DemoTradingRuntime],selectors:[null,null,null]});assert.deepEqual(r.entries[0].map(({side,result,...e})=>e),r.entries[2].map(({side,result,...e})=>e),'calibration changed admission/timing');r.fixtureSha256=createHash('sha256').update(bytes).digest('hex');
  r.selection=r.entries.map(es=>{const gaps=es.slice(1).map((e,i)=>(e.at-es[i].at)/1000).sort((a,b)=>a-b);return{entries:es.length,medianGapSeconds:gaps[Math.floor(gaps.length/2)]??null,maxGapSeconds:gaps.at(-1)??null};});results.push(r);
 }
}finally{Date.now=realNow;c.cleanup();cal.cleanup();}
const totals=[0,1,2].map(i=>{const m=metrics(results.flatMap(r=>r.entries[i]));delete m.maxLossStreak;return {...m,illustrativeNetAt86Percent:m.win*.86-m.loss,worstWindowLossStreak:Math.max(0,...results.map(r=>r.metrics[i].maxLossStreak))};});
const summary={totals,windows:results.map(r=>({name:r.name,metrics:r.metrics,selection:r.selection,comparison:r.comparisons[0]})),improved:results.filter(r=>r.metrics[1].winRate>r.metrics[0].winRate).length,worsened:results.filter(r=>r.metrics[1].winRate<r.metrics[0].winRate).length,coverage:totals[0].completed?totals[1].completed/totals[0].completed:null};
summary.variantLabels=['current','ordered-rejection','frozen-route-inversion'];
summary.byCandidate=[1,2].map(i=>({variant:summary.variantLabels[i],improvedWindows:results.filter(r=>r.metrics[i].winRate>r.metrics[0].winRate).length,worsenedWindows:results.filter(r=>r.metrics[i].winRate<r.metrics[0].winRate).length,coverage:totals[i].completed/totals[0].completed}));
if(mode==='crypto')summary.byDay=Object.fromEntries(['2025-10-15','2025-10-16','2025-10-17'].map(day=>{const rows=results.filter(r=>r.name.includes(day));return [day,[0,1,2].map(i=>{const win=rows.reduce((s,r)=>s+r.metrics[i].win,0),loss=rows.reduce((s,r)=>s+r.metrics[i].loss,0);return{win,loss,rate:win/(win+loss)};})];}));
writeFileSync(new URL('../reports/sentinel-accuracy-repair-ab-20261018-'+mode+'.json',import.meta.url),JSON.stringify({spec,mode,summary,results},null,2)+'\n');console.log(JSON.stringify({summary},null,2));
