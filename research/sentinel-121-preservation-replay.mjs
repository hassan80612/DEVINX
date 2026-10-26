// Paired full-gate comparison; the later quote is used ONLY to score an issued entry.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {DemoTradingRuntime as Candidate} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),base=process.env.SENTINEL_BASELINE_REF||'518bf8c48514e9bf1a93e663920dea3bb3218fcd';
const temporary=mkdtempSync(join(tmpdir(),'sentinel-121-preservation-'));
try{
 execFileSync('tar',['-x','-C',temporary],{input:execFileSync('git',['archive',base,'sentinel-trading-lab/agent/src/core'],{cwd:root,maxBuffer:20*1024*1024})});
 const {DemoTradingRuntime:Baseline}=await import(pathToFileURL(join(temporary,'sentinel-trading-lab/agent/src/core/runtime.mjs')));
 const fixture=JSON.parse(readFileSync(join(root,'tests/fixtures/sentinel-continuation-prices.json'))),tape=fixture.quoteHistory;
 const replay=(Runtime,engine,durationMs,latencyMs)=>{
  const rt=new Runtime({enableVNext:true,forecastModel:'short-probability-v1'});rt.patchSettings({engine,orderDurationMs:durationMs},'offline-paired-replay');
  const entries=[];let last=0;
  for(let i=0;i<tape.length;i++){
   const q=tape[i],now=q.ts+latencyMs;
   const out=rt._signalValidationGate({analysis:{},settings:rt.settings,now,snap:{provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:tape.slice(0,i+1),candles:fixture.candles,historicalCandlesVerified:true,payout:null}});
   const a=out.analysis?.vnext?.futureEntryAnchor;
   if(a?.phase!=='fired'||a.entryTriggeredAt===last)continue;last=a.entryTriggeredAt;
   const exit=tape.find(p=>p.ts>=a.exitAt&&p.ts-a.exitAt<=1500),delta=exit?exit.price-q.price:null;
   entries.push({at:last,side:a.side,entry:q.price,exitAt:a.exitAt,exit:exit?.price??null,outcome:delta==null?'pending':delta===0?'tie':(delta>0)===(a.side==='CALL')?'win':'loss'});
  }
  return {entries,...Object.fromEntries(['win','loss','tie','pending'].map(k=>[k,entries.filter(e=>e.outcome===k).length]))};
 };
 const cases=[];
 for(const engine of ['automatic','fibonacci_retest','trend','support_resistance','smart_confluence'])for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])for(const latencyMs of [0,600]){
  const before=replay(Baseline,engine,durationMs,latencyMs),after=replay(Candidate,engine,durationMs,latencyMs);
  cases.push({engine,durationMs,latencyMs,before,after,strictlyWorse:after.loss>before.loss&&after.win<=before.win||after.win<before.win&&after.loss>=before.loss});
 }
 console.log(JSON.stringify({baseline:base,source:'tests/fixtures/sentinel-continuation-prices.json',limits:['One 179-second recorded trace; scenarios share prices and are not independent.','600ms is assumed evaluation delay, not measured broker fill.','Quote scoring does not prove live trading accuracy.'],cases},null,2));
}finally{rmSync(temporary,{recursive:true,force:true})}
