// Fixed-source A/B: original production 13.9.7 vs isolated candidate.
// Both engines read identical chronological quote history; no broker orders.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DemoTradingRuntime as Candidate} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const {DemoTradingRuntime:Baseline}=await import(pathToFileURL(resolve('baseline1397/sentinel-trading-lab/agent/src/core/runtime.mjs')));
const recorded=JSON.parse(readFileSync(new URL('./fixtures/sentinel-continuation-prices.json',import.meta.url),'utf8')).quoteHistory;
const base=Date.UTC(2026,9,1),ASSET='REPLAY/TEST';
const sign=s=>s==='CALL'?1:s==='PUT'?-1:0;
function makeRows(kind,seed=0,length=540){
 const q=[],phase=seed*.38,p=kind.startsWith('range-p')?
   Number(kind.slice('range-p'.length)):kind.includes('slow')?86:
   kind.includes('fast')?32:kind.includes('mid')?48:
   kind.includes('wide')?68:kind.includes('noisy')?37:48;
 for(let i=0;i<length;i++){
  const drift=kind==='up'?i*.000011:kind==='down'?-i*.000011:
    kind==='turn'?(i<270?i*.000011:270*.000011-(i-270)*.000020):
    kind==='weak-trend'?i*.000004:
    kind==='range-drift'?i*.000002:
    kind==='range-breakout'&&i>270?(i-270)*.000018:0;
  const range=kind.startsWith('range')?.00068*(Math.sin(i*2*Math.PI/p+phase)
    +(kind.includes('noisy')?.30*Math.sin(i*2*Math.PI/17+phase/2):0)):0;
  const chop=kind==='chop'?.00064*(Math.sin(i*2*Math.PI/37+phase)+.35*Math.sin(i*2*Math.PI/17+phase/3)):0;
  const noise=.000009*Math.sin(i*1.73+phase)+.000006*Math.cos(i*.45+phase);
  const ts=base+i*1000;
  q.push({ts,receivedAt:ts,price:Math.exp(Math.log(1.082)+drift+range+chop+noise)});
 }
 return q;
}
function makeRuntime(Type,mode,duration){
 const runtime=new Type({enableVNext:true,forecastModel:mode});
 runtime.settings.asset=ASSET;runtime.settings.engine='automatic';
 runtime.settings.forecastMode='continuous';
 runtime.settings.orderDurationMs=duration;
 runtime.settings.forecastHorizonSeconds=duration/1000;
 return runtime;
}
async function replay(Type,mode,rows,duration){
 const run=makeRuntime(Type,mode,duration),signals=[];let error=null,checks=0,phaseCount={};
 for(let i=0;i<rows.length;i++){
  const sample=rows.slice(0,i+1),current=rows[i];
  try{
   const r=run._signalValidationGate({analysis:{asset:ASSET},snap:{
    price:current.price,quoteTs:current.ts,quoteHistory:sample,
    provider:'iq_option',instrument:'digital',candles:[],
    brokerExpirationConfidence:0,brokerExpirationDurationMs:null,mode:'demo'
   },settings:run.settings,now:current.ts});
   checks++;
   const win=run.vnextWindowState,phase=win?.phase||'none';
   phaseCount[phase]=(phaseCount[phase]||0)+1;
   if(win?.phase==='fired'&&Number(win.entryTriggeredAt)>0&&
    signals.at(-1)?.at!==Number(win.entryTriggeredAt)){
     const at=Number(win.entryTriggeredAt);
     signals.push({at,side:win.side,entry:current.price,exitAt:Number(win.exitAt),
       duration,nowAt:current.ts});
   }
  }catch(e){error=String(e?.stack||e);break;}
 }
 const outcomes=signals.map(s=>{
  const q=rows.find(x=>x.ts>=s.exitAt&&x.ts<=s.exitAt+1000);
  return q?{...s,status:sign(s.side)*(q.price-s.entry)>0?'win':sign(s.side)*(q.price-s.entry)<0?'loss':'tie'}:
  {...s,status:'missing'};
 });
 const wins=outcomes.filter(x=>x.status==='win').length;
 const losses=outcomes.filter(x=>x.status==='loss').length;
 const overlaps=outcomes.filter((x,i)=>i>0&&x.at<outcomes[i-1].exitAt).length;
 return {signals:signals.length,completed:wins+losses,wins,losses,
   missing:outcomes.filter(x=>x.status==='missing').length,overlaps,
   firstSignalAt:signals[0]?.at||null,checks,error,
   examples:outcomes.slice(0,3),phaseCount};
}
const cases=[{name:'recorded-180s-down',type:'recorded',seed:0,h:30,rows:recorded}];
const kinds=['up','down','turn','weak-trend','range-mid','range-fast','range-slow','range-wide','range-noisy','chop',
 'range-p24','range-p41','range-p52','range-p62','range-p77','range-p96','range-drift','range-breakout'];
for(const kind of kinds)for(const h of [30,60])for(const seed of [0,1,2]){
 const type=kind.startsWith('range')||kind==='chop'?'range':kind==='turn'?'reversal':'directional';
 cases.push({name:kind,type,seed,h,rows:makeRows(kind,seed)});
}
const summaries=new Map();
for(const c of cases){
 const b=await replay(Baseline,'now-structural-v1',c.rows,c.h*1000);
 const v=await replay(Candidate,'now-structural-v1',c.rows,c.h*1000);
 const key=c.type+'|'+c.h;
 if(!summaries.has(key))summaries.set(key,{source:c.type,expiry:c.h,cases:0,baseline:{n:0,verified:0,w:0,l:0,overlaps:0},candidate:{n:0,verified:0,w:0,l:0,overlaps:0},examples:[]});
 const group=summaries.get(key);group.cases++;
 for(const [actual,k] of [[b,'baseline'],[v,'candidate']]){
  group[k].n+=actual.signals;group[k].verified+=actual.completed;
  group[k].w+=actual.wins;group[k].l+=actual.losses;
  group[k].overlaps+=actual.overlaps;
 }
 group.examples.push({name:c.name,seed:c.seed,base:b.wins+'/'+b.completed,trial:v.wins+'/'+v.completed,baseN:b.signals,newN:v.signals});
 if(b.error||v.error){
  console.error('COMPARE_ERROR',JSON.stringify({name:c.name,seed:c.seed,h:c.h,baseline:b.error,candidate:v.error}));process.exitCode=1;
 }
}
for(const group of summaries.values()){
 const pct=x=>x.verified?+(x.w/x.verified*100).toFixed(1):null;
 console.log('REGIME_COMPARE '+JSON.stringify({...group,baselineRate:pct(group.baseline),candidateRate:pct(group.candidate)}));
}
console.log('TEST_METHOD','source-pinned original 13.9.7 runtime vs candidate; chronological quotes; synthetic scenarios are NOT evidence of real-broker win rates');
