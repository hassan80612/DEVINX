// Offline paired A/B. Only historical received quotes may inform a decision.
// Future quotes appear EXCLUSIVELY in outcome scoring after the entry.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DemoTradingRuntime as Candidate} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const baseline='99303b4ddb061dc869925977369d6daee06b60d5';
const temporary=mkdtempSync(join(tmpdir(),'sentinel-139118-ab-'));
try{
 execFileSync('tar',['-x','-C',temporary],{
  input:execFileSync('git',['archive',baseline,'sentinel-trading-lab/agent/src/core'],
   {cwd:root,maxBuffer:25*1024*1024})});
 const {DemoTradingRuntime:Original}=await import(pathToFileURL(join(temporary,'sentinel-trading-lab/agent/src/core/runtime.mjs')));
 const fixture=JSON.parse(readFileSync(join(root,'tests/fixtures/sentinel-continuation-prices.json')));
 const tape=fixture.quoteHistory;
 const cases=[],summary={same:0,changed:0,regressions:0,improvements:0};
 const replay=(Runtime,engine,durationMs,latencyMs)=>{
  const rt=new Runtime({enableVNext:true,forecastModel:'short-probability-v1'});
  rt.patchSettings({engine,orderDurationMs:durationMs},'offline-study');
  const entries=[],decisions=[];
  let last=0;
  for(let i=0;i<tape.length;i++){
   const q=tape[i],now=q.ts+latencyMs;
   const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now,
    snap:{provider:'iq_option',price:q.price,quoteTs:q.ts,
     quoteHistory:tape.slice(0,i+1),candles:fixture.candles,
     historicalCandlesVerified:true,payout:null}});
   const obs=out.analysis?.vnext?.nowObservation;
   decisions.push({ts:q.ts,ready:obs?.ready===true,side:obs?.side??null,
    reason:obs?.reason??null});
   const signal=out.analysis?.vnext?.futureEntryAnchor;
   if(signal?.phase!=='fired'||signal.entryTriggeredAt===last)continue;
   last=signal.entryTriggeredAt;
   const settled=tape.find(p=>p.ts>=signal.exitAt&&p.ts-signal.exitAt<=1500);
   const delta=settled?settled.price-q.price:null;
   entries.push({at:q.ts,side:signal.side,
    result:delta==null?'pending':delta===0?'tie':
     (delta>0)===(signal.side==='CALL')?'win':'loss'});
  }
  return {entries,decisions};
 };
 for(const engine of ['automatic','support_resistance','smart_confluence','trend','mean_reversion'])
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])
 for(const latencyMs of [0,600]){
  const old=replay(Original,engine,durationMs,latencyMs),
   next=replay(Candidate,engine,durationMs,latencyMs);
  const counts=x=>({win:x.filter(e=>e.result==='win').length,
   loss:x.filter(e=>e.result==='loss').length,
   pending:x.filter(e=>e.result==='pending').length,
   total:x.length});
  const oldOutcome=counts(old.entries),newOutcome=counts(next.entries);
  const changes=old.decisions.reduce((n,d,i)=>{
   const x=next.decisions[i];return n+(d.ready!==x.ready||d.side!==x.side?1:0);
  },0);
  const bad=newOutcome.loss>oldOutcome.loss&&newOutcome.win<=oldOutcome.win||
   newOutcome.win<oldOutcome.win&&newOutcome.loss>=oldOutcome.loss;
  const improved=newOutcome.loss<oldOutcome.loss&&newOutcome.win>=oldOutcome.win||
   newOutcome.win>oldOutcome.win&&newOutcome.loss<=oldOutcome.loss;
  summary.changed+=changes?1:0;summary.same+=changes?0:1;
  summary.regressions+=bad?1:0;summary.improvements+=improved?1:0;
  cases.push({engine,durationMs,latencyMs,decisionChanges:changes,old:oldOutcome,after:newOutcome,bad,improved});
 }
 console.log('REVERSAL_PAIRED_AB '+JSON.stringify({baseline,source:'one 179s recorded quote fixture; scenarios share data, not independent',summary,
  changedCases:cases.filter(x=>x.decisionChanges||x.bad||x.improved).slice(0,80),
  cases:cases.length,limits:['This is a single old recording, not the latest live journal.',
   'No trading account was accessed. 600ms simulated latency is not broker execution latency.',
   'Passing the test does not establish any future win rate.']}));
 if(summary.regressions)process.exitCode=1;
}finally{rmSync(temporary,{recursive:true,force:true})}
