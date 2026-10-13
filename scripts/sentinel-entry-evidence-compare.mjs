import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as current from '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const baseline=await import(pathToFileURL(process.argv[2]||'/tmp/sentinel-6726-control/sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs'));
function fixture(kind,seed){
 let state=seed,p=1.1;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 return Array.from({length:2851},(_,i)=>{
  const noise=(random()+random()+random()-1.5)*.000025;
  const phase=i%180;
  const drift=kind==='continuous-strength'?.000007:kind==='trend-to-lateral'?(i<1800?.000007:0):kind==='lateral-range'?.000025*Math.cos(i/40):kind==='lateral'?0:
    phase<115?.00001:phase<155?-.000021:.000013;
  p*=Math.exp(drift+noise);
  return {ts:1800000000000+i*1000,price:p};
 });
}
function replay(module,quotes,settings){
 let window=null,opened=0,flips=0,repeats=0;const trades=[],seen=new Set(),durations=[];
 for(let i=1800;i<=2700;i++){
  const now=quotes[i].ts,q=quotes.slice(Math.max(0,i-3600),i+1);
  const snap={quoteHistory:q,quoteTs:now,price:q.at(-1).price,provider:'controlled-replay'};
  const args={settings,snap,now,forecastModel:'selected-strengths-67.5'};
  const locked=window&&now<window.windowEndsAt&&window.phase!=='scanning';
  const started=performance.now();
  const candidate=locked?window:module.futureEntrySchedule({...args,delays:[30],activeWindow:window&&now<window.windowEndsAt?window:null})[0];
  const confirmation=window?.phase==='open'&&now>=window.entryAt&&now<window.windowEndsAt?
    module.confirmWindowEntry({...args,entryAt:window.entryAt}):null;
  const next=evolveOpportunity({previous:window,candidate,settings,now,quoteAt:now,confirmation});
  durations.push(performance.now()-started);
  if(next.phase==='open'&&window?.phase!=='open')opened++;
  if(window?.side&&now<window.windowEndsAt&&next.side!==window.side)flips++;
  if(next.entryReadyNow){
   if(seen.has(next.windowStartedAt))repeats++;
   seen.add(next.windowStartedAt);
   const move=quotes[i+30].price-quotes[i].price;
   trades.push({at:now,side:next.side,correct:move!==0&&(move>0)===(next.side==='CALL')});
  }
  window=next;
 }
 durations.sort((a,b)=>a-b);
 return {opened,trades:trades.length,wins:trades.filter(t=>t.correct).length,
   losses:trades.filter(t=>!t.correct).length,accuracy:trades.length?trades.filter(t=>t.correct).length/trades.length:null,
   flips,repeats,p95Ms:durations[Math.floor(durations.length*.95)],maxMs:durations.at(-1)};
}
const previous=process.argv[4]?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
const report={baselineCommit:'7cd0e7315fd7b6a59ad82142ffc8db7491c902ca',kind:'deterministic simulated quotes, not broker trades',rows:[]};
for(const kind of (process.env.SENTINEL_COMPARE_CASES||'continuous-strength,lateral,retracement').split(','))for(const seed of [17,83]){
 const quotes=fixture(kind,seed);
 for(const [mode,engine] of [['continuous','automatic'],['continuous','breakout'],['selective','automatic']]){
  const settings={asset:kind+'-'+seed,engine,forecastMode:mode,orderDurationMs:30000};
  const reference=previous?.rows.find(r=>r.kind===kind&&r.seed===seed&&r.mode===mode&&r.engine===engine);
  const before=reference?.before||replay(baseline,quotes,settings),after=replay(current,quotes,settings);
  if(reference&&process.env.SENTINEL_COMPARE_UNCHANGED==='1')for(const key of ['opened','trades','wins','losses','flips','repeats']){
   if(after[key]!==reference.after[key])throw Error('optimization changed decisions: '+kind+' '+engine+' '+key);
  }
  const row={kind,seed,mode,engine,before,after};report.rows.push(row);console.log(JSON.stringify(row));
 }
}
fs.writeFileSync(process.argv[3]||'/tmp/sentinel-entry-evidence-comparison.json',JSON.stringify(report,null,2));
