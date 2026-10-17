// Read-only, chronological audit. No broker calls, orders or production edits.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';

const H=30000,asset='EUR/GBP OTC',engineId='fibonacci_retest';
const clock=t=>new Date(t-3*3600000).toISOString().slice(11,23);
export function observedAt(rows,target,tolerance=1000){
 return rows.find(q=>q.ts>=target&&q.ts<=target+tolerance)||null;
}
export function confirmations(observations,{delayMs=0,resetEachOperation=false}={}){
 let state=null,pending=null,lastQuote=null;const entries=[];
 for(const {q,candidate} of observations){
  const active=state?.phase==='fired'&&q.ts<state.exitAt;
  if(resetEachOperation&&active)pending=null;
  else if(candidate.ready&&['CALL','PUT'].includes(candidate.side)){
   if(!pending||pending.side!==candidate.side||lastQuote==null||q.ts-lastQuote>1500)
    pending={side:candidate.side,since:q.ts};
  }else pending=null;
  const ready=delayMs===0?candidate.ready:!!pending&&q.ts-pending.since>=delayMs;
  const next=advanceNowOpportunity({previous:state,candidate:{...candidate,ready},
   now:q.ts,quoteAt:q.ts,asset,engineId,durationMs:H});
  if(next?.phase==='fired'&&next.entryTriggeredAt!==state?.entryTriggeredAt)
   entries.push({...next,reason:candidate.reason,confirmationSince:pending?.since??q.ts,
    admissionWaitMs:pending?q.ts-pending.since:0,
    priorExpiry:state?.exitAt??state?.lastExpiryAt??null});
  state=next;lastQuote=q.ts;
 }
 return entries;
}
function wilson(w,n){
 if(!n)return null;const z=1.95996398454,p=w/n,d=1+z*z/n;
 const mid=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return [mid-half,mid+half].map(x=>100*x);
}
export function score(rows,entries,{resolution=1e-6,shiftMs=0,from=-Infinity,to=Infinity}={}){
 const selected=entries.filter(e=>e.entryAt>=from&&e.entryAt<to);
 const stats={signals:selected.length,wins:0,losses:0,ties:0,missing:0,
  resolutionUncertain:0,longestLossStreak:0,entries:[]};let streak=0;
 for(const e of selected){
  const p=observedAt(rows,e.entryAt+shiftMs),exit=observedAt(rows,e.exitAt+shiftMs);
  const delta=p&&exit?exit.price-p.price:null;
  const outcome=delta==null?'missing':delta===0?'ties':
   ((delta>0?'CALL':'PUT')===e.side?'wins':'losses');
  stats[outcome]++;if(delta!=null&&Math.abs(delta)<=resolution*1.000001)stats.resolutionUncertain++;
  streak=outcome==='losses'?streak+1:0;stats.longestLossStreak=Math.max(streak,stats.longestLossStreak);
  stats.entries.push({at:e.entryAt,time:clock(e.entryAt),side:e.side,reason:e.reason,
   price:p?.price??null,exit:exit?.price??null,delta,outcome,
   idleSincePriorExpiryMs:e.priorExpiry?e.entryAt-e.priorExpiry:null,
   admissionWaitMs:e.admissionWaitMs});
 }
 const n=stats.wins+stats.losses;
 stats.winRate=n?100*stats.wins/n:null;stats.wilson95=wilson(stats.wins,n);
 stats.resolved=n;stats.coverage=selected.length?n/selected.length:0;
 return stats;
}
function valueAtOrBefore(rows,at){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)return at-rows[i].ts<=1500?rows[i].price:null;
 return null;
}
function diagnostics(rows,observations,entries){
 const by=new Map(observations.map(x=>[x.q.ts,x]));
 return entries.map(e=>{
  const record=by.get(e.entryAt),past=rows.filter(q=>q.ts<=e.entryAt&&q.ts>=e.entryAt-30000);
  const end=observedAt(rows,e.exitAt),p=record.q.price;
  const values=Object.fromEntries([3,6,10,30].map(s=>{const old=valueAtOrBefore(rows,e.entryAt-s*1000);return [s,old==null?null:(p-old)/p];}));
  const first5=observedAt(rows,e.entryAt+5000),last=observedAt(rows,e.exitAt);
  const high=Math.max(...past.map(x=>x.price)),low=Math.min(...past.map(x=>x.price));
  const f=thirtySecondCycleForecast({quoteHistory:rows.filter(q=>q.ts<=e.entryAt),quoteAt:e.entryAt,now:e.entryAt,price:p});
  const w=thirtySecondCycleForecast({quoteHistory:rows.filter(q=>q.ts<=e.entryAt),quoteAt:e.entryAt,now:e.entryAt,price:p,periodSearch:'wide'});
  return {time:clock(e.entryAt),at:e.entryAt,side:e.side,reason:e.reason,
   correct:last&&last.price!==p?(last.price>p?'CALL':'PUT')===e.side:null,
   first5Direction:first5?(first5.price>p?'CALL':first5.price<p?'PUT':'TIE'):null,
   currentMove:values,positionInPrior30sRange:high>low?(p-low)/(high-low):null,
   narrow:{side:f.side,period:f.fittedPeriodSeconds,residual:f.fitResidual,move:f.expectedLogMove},
   wide:{side:w.side,period:w.fittedPeriodSeconds,residual:w.fitResidual,move:w.expectedLogMove},
   finalObservedPrice:end?.price??null};
 });
}
export function auditFixture(fixture){
 const rows=fixture.quoteHistory,selector=new CompletedExpiryDirection(),observations=[],cpu=[];
 const context=['iq_option',asset,H].join('|');
 for(let i=0;i<rows.length;i++){
  const q=rows[i],start=performance.now();
  const candidate=analyzeNowOpportunity({quoteHistory:rows.slice(0,i+1),quoteAt:q.ts,now:q.ts,
   price:q.price,durationMs:H,engineId,qualityPolicy:'adaptive-market-v17',
   expiryDirectionSelector:selector,expiryDirectionContext:context});
  cpu.push(performance.now()-start);observations.push({q,candidate});
 }
 const baseline=confirmations(observations),policies=[];
 for(const delayMs of [0,500,1000,2000,3000,5000])for(const resetEachOperation of delayMs?[false,true]:[false]){
  const entries=confirmations(observations,{delayMs,resetEachOperation});
  const options={resolution:fixture.priceResolution};
  policies.push({delayMs,resetEachOperation,
   full:score(rows,entries,options),
   firstSixMinutes:score(rows,entries,{...options,to:rows[0].ts+360000}),
   finalThreeMinutes:score(rows,entries,{...options,from:rows[0].ts+360000}),
   oneSecondLater:score(rows,entries,{...options,shiftMs:1000}),
   twoSecondsLater:score(rows,entries,{...options,shiftMs:2000})});
 }
 // Verify that the independent replay actually reproduces production runtime.
 const runtime=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 const settings={...runtime.settings,engine:engineId,asset,orderDurationMs:H};const actual=[];
 for(let i=0;i<rows.length;i++){
  const q=rows[i],v=runtime._signalValidationGate({analysis:{asset},settings,now:q.ts,
   snap:{provider:'iq_option',quoteHistory:rows.slice(0,i+1),price:q.price,quoteTs:q.ts}}).analysis.vnext;
  if(v.futureEntryAnchor?.entryReadyNow)actual.push([v.futureEntryAnchor.entryAt,v.futureEntryAnchor.side]);
 }
 const same=JSON.stringify(actual)===JSON.stringify(baseline.map(e=>[e.entryAt,e.side]));
 if(!same)throw Error('research replay does not match production runtime');
 const idleReasons={};for(const x of observations)if(!x.candidate.ready)idleReasons[x.candidate.reason]=(idleReasons[x.candidate.reason]||0)+1;
 cpu.sort((a,b)=>a-b);
 return {source:fixture.source,sourceSha256:fixture.sourceSha256,sourceType:fixture.sourceType,
  limitations:fixture.limitations,points:rows.length,observedSpanSeconds:(rows.at(-1).ts-rows[0].ts)/1000,
  historical100CandlesAvailable:false,productionRuntimeMatchesReplay:same,
  calculationMs:{mean:cpu.reduce((s,x)=>s+x,0)/cpu.length,p95:cpu[Math.floor(cpu.length*.95)],max:cpu.at(-1)},
  idleReasons,policies,baselineDiagnostics:diagnostics(rows,observations,baseline),
  oppositeEverySignal:score(rows,baseline.map(x=>({...x,side:x.side==='CALL'?'PUT':'CALL'})),{resolution:fixture.priceResolution}),
  originalVisibleSignals:score(rows,(fixture.visibleSignals||[]).map(s=>({side:s.side,
   entryAt:Date.parse('2026-10-16T'+s.time+'-03:00'),exitAt:Date.parse('2026-10-16T'+s.expiry+'-03:00')})),{resolution:fixture.priceResolution})};
}
export function main(){
 const results={version:'13.9.31',productionCommit:'e2270fc629cc71e9ef8d07bb5a1268b071888bc4',
  purpose:'Retrospective diagnosis; waiting policies are experiments, not released changes or independent market validation.',
  fixtures:{}};
 for(const name of ['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json']){
  const fixture=JSON.parse(readFileSync(new URL('../tests/fixtures/'+name,import.meta.url)));
  const report=auditFixture(fixture);results.fixtures[name]=report;
  console.log(name,JSON.stringify(report.policies.map(x=>({delay:x.delayMs,reset:x.resetEachOperation,w:x.full.wins,l:x.full.losses,tie:x.full.ties,missing:x.full.missing,holdout:[x.finalThreeMinutes.wins,x.finalThreeMinutes.losses],late1s:[x.oneSecondLater.wins,x.oneSecondLater.losses],late2s:[x.twoSecondsLater.wins,x.twoSecondsLater.losses]}))));
 }
 const folder=new URL('../reports/',import.meta.url);mkdirSync(folder,{recursive:true});
 writeFileSync(new URL('sentinel-13931-complete-audit-20261017.json',folder),JSON.stringify(results,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
