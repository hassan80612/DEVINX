import {readFileSync,writeFileSync} from 'node:fs';
import {OnlineFinalRoute} from '../experiments/online-final-route-20261018.mjs';
import {metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
const spec={purpose:'Exploratory screening on already-inspected data only. No heldout improvement claim.',minimum:12,limit:24,rule:'At each original issued signal, grade only previously expired issued entries in the same session/reason/context. Keep last 24 non-tie outcomes of the ORIGINAL raw side, regardless of later inversion. After 12 results, invert only when that raw side lost more than won. Never change admission, entry timestamp/price or 30s deadline. No tuning after this screen.'};
const sources=[['known',new URL('../reports/sentinel-final-conflict-audit-20261018-known.json',import.meta.url)],['crypto-known',new URL('../reports/sentinel-accuracy-repair-ab-20261018-crypto.json',import.meta.url)]];
const results=[];
for(const [set,url] of sources){
 const d=JSON.parse(readFileSync(url));
 for(const r of d.results){
  const entries=r.entries[0].map((e,i)=>({...e,reason:e.reason??r.entryReasons[0][i].reason}));
  const model=new OnlineFinalRoute(spec),pending=[],out=[];let inverted=0;
  for(const e of entries){
   for(let i=pending.length-1;i>=0;i--)if(pending[i].dueAt<=e.at){const p=pending.splice(i,1)[0];model.record({context:r.name,reason:p.reason,result:p.result});}
   const choice=model.select({context:r.name,reason:e.reason,side:e.side}),flip=choice.side!==e.side;inverted+=Number(flip);
   out.push({...e,side:choice.side,result:flip?(e.result==='win'?'loss':e.result==='loss'?'win':e.result):e.result,trainingCompleted:choice.completed});pending.push(e);
  }
  results.push({set,name:r.name,baseline:metrics(entries),online:metrics(out),inverted,entries:out});
 }
}
const summary=Object.fromEntries(['known','crypto-known'].map(set=>{const rows=results.filter(r=>r.set===set),totals={};for(const key of ['baseline','online']){const win=rows.reduce((s,r)=>s+r[key].win,0),loss=rows.reduce((s,r)=>s+r[key].loss,0);totals[key]={win,loss,winRate:win/(win+loss),illustrativeNetAt86Percent:win*.86-loss,worstWindowLossStreak:Math.max(...rows.map(r=>r[key].maxLossStreak))};}return[set,{...totals,inverted:rows.reduce((s,r)=>s+r.inverted,0),improved:rows.filter(r=>r.online.winRate>r.baseline.winRate).length,worsened:rows.filter(r=>r.online.winRate<r.baseline.winRate).length}];}));
writeFileSync(new URL('../reports/sentinel-online-route-screen-20261018.json',import.meta.url),JSON.stringify({spec,summary,results},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
