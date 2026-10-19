// Descriptive attribution of existing entry traces. No model selection,
// threshold fitting, changed timestamps, or modification of production.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
const read=p=>{const u=new URL('../reports/'+p,import.meta.url);return JSON.parse(existsSync(u)?readFileSync(u):gunzipSync(readFileSync(new URL(u.href+'.gz'))));};
const known=read('sentinel-final-conflict-audit-20261018-known.json');
const traced=known.results.flatMap(r=>r.entries[0].map(e=>({...e,window:r.name})));
const valid=x=>x?.ready===true&&['CALL','PUT'].includes(x.side);
const count=xs=>({win:xs.filter(e=>e.result==='win').length,loss:xs.filter(e=>e.result==='loss').length,tie:xs.filter(e=>e.result==='tie').length});
const hypothetical=(e,side)=>['win','loss'].includes(e.result)?(side===e.side?e.result:e.result==='win'?'loss':'win'):e.result;
const pairs=[['selected','historical'],['historical','candle'],['candle','final']];
const stageFlips=pairs.map(([before,after])=>{
 const rows=traced.filter(e=>valid(e.trace[before])&&valid(e.trace[after])&&e.trace[before].side!==e.trace[after].side);
 const result=e=>({window:e.window,at:e.at,before:e.trace[before],after:e.trace[after],finalSide:e.side,
  beforeOutcome:hypothetical(e,e.trace[before].side),afterOutcome:hypothetical(e,e.trace[after].side)});
 const out=rows.map(result);
 return {before,after,flips:rows.length,corrected:out.filter(e=>e.beforeOutcome==='loss'&&e.afterOutcome==='win').length,
  spoiled:out.filter(e=>e.beforeOutcome==='win'&&e.afterOutcome==='loss').length,
  examples:out.filter(e=>e.beforeOutcome==='win'&&e.afterOutcome==='loss').slice(0,3)};
});
const flipped=e=>pairs.some(([a,b])=>valid(e.trace[a])&&valid(e.trace[b])&&e.trace[a].side!==e.trace[b].side);
const opposed=e=>e.trace.finalOpposesForecast===true;
const routeSummary=(source,entries)=>{
 const reasons=[...new Set(entries.map(e=>e.reason))];
 return {source,totals:count(entries),routes:Object.fromEntries(reasons.map(reason=>{
  const rows=entries.filter(e=>e.reason===reason),m=count(rows);return [reason,{...m,winRate:m.win+m.loss?m.win/(m.win+m.loss):null}];
 }))};
};
const external=[['crypto-known','sentinel-accuracy-repair-ab-20261018-crypto.json'],['crypto-screen','sentinel-actual-entry-reference-ab-20261018-validation.json']].map(([label,file])=>{
 const rows=read(file).results.flatMap(r=>{const reasons=new Map(r.entryReasons[0].map(e=>[e.at,e.reason]));return r.entries[0].map(e=>({...e,reason:reasons.get(e.at)}));});
 return routeSummary(label,rows);
});
const report={method:'Descriptive attribution from previously inspected external replay entries, not broker OTC. Each before/after side is scored at the exact same recorded entry price and expiry. Adjacent stage flips require both stages to be ready; reactivations from a blocked stage are counted separately. Route labels are attribution, not proof of causal responsibility or a future profitable rule.',
 source:'sentinel-final-conflict-audit-20261018-known.json',windows:known.results.length,total:count(traced),stageFlips,
 finalWithAnyAdjacentFlip:count(traced.filter(flipped)),finalWithoutAdjacentFlip:count(traced.filter(e=>!flipped(e))),
 finalOpposedToSelectedExpiryForecast:count(traced.filter(opposed)),finalNotOpposedToSelectedExpiryForecast:count(traced.filter(e=>!opposed(e))),
 blockedHistoricalConflictReactivated:count(traced.filter(e=>e.trace.conflictReactivated)),
 byRoute:[routeSummary('forex-known',traced),...external],
 conclusion:'Conflicting authority exists at specific writers. On the traced Forex sample, it is not sufficient to explain the bulk of wrong signals; many wrong final directions do not contain an adjacent ready-to-ready flip. A blanket opposite-signal or conflict veto is not justified. No production change.'};
writeFileSync(new URL('../reports/sentinel-conflict-loss-attribution-20261019.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,byRoute:undefined,stageFlips:stageFlips.map(({examples,...x})=>x)},null,2));
