// Read-only investigation of the actually changed entry decisions. No broker,
// order execution, parameter fitting, generated candles or remote requests.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),'sentinel-112-entry-'));
const base='36a7dcca579ff5da33b307c34c9467cfd2d16e44';
const released='5cef30906ee4473c28c87edde405cb46c32eff53';
let releaseArchive= released;
try{execFileSync('git',['cat-file','-e',released+'^{commit}'],{cwd:root,stdio:'pipe'});}
catch{
 // The publication API made a squashed public commit. Its local predecessor
 // is usable only if the ENTIRE source tree is byte-identical to publication.
 const tree=execFileSync('git',['rev-parse','ce88f154^{tree}'],{cwd:root,encoding:'utf8'}).trim();
 if(tree!=='3a2e82f5f1107ce32c4ffbc69cc787bedf1577d6')throw Error('112 source tree mismatch');
 releaseArchive='ce88f154';
}
const core='sentinel-trading-lab/agent/src/core';
const read=(dir,name)=>readFileSync(join(dir,core,name),'utf8');
const put=(dir,name,text)=>writeFileSync(join(dir,core,name),text);
try{
 const directories={};
 for(const [name,ref] of [['107',base],['112',releaseArchive]]){
  const dir=join(temporary,name);directories[name]=dir;
  execFileSync('mkdir',['-p',dir]);
  execFileSync('tar',['-x','-C',dir],{input:execFileSync('git',['archive',ref,core],{cwd:root,maxBuffer:20*1024*1024})});
 }
 for(const name of ['112-with-107-wall','112-without-second-side-check','112-with-both-107-checks']){
  const dir=join(temporary,name);directories[name]=dir;cpSync(directories['112'],dir,{recursive:true});
  if(name!=='112-without-second-side-check')put(dir,'verified-wall-exhaustion.mjs',read(directories['107'],'verified-wall-exhaustion.mjs'));
  if(name!=='112-with-107-wall'){
   let source=read(dir,'runtime.mjs');const a=source.indexOf('      const observation=reviewChangedOpportunitySide('),b=source.indexOf('      // Passive audit',a);
   if(a<0||b<0)throw Error('112 runtime structure changed');
   source=source.slice(0,a)+'      const observation=revisedObservation;\n'+source.slice(b);put(dir,'runtime.mjs',source);
  }
 }
 directories['candidate-level-roles']=join(temporary,'candidate-level-roles');
 cpSync(join(root,core),join(directories['candidate-level-roles'],core),{recursive:true});
 const variants={};
 for(const [name,dir] of Object.entries(directories)){
  // Expose the pre-existing intermediate verdict only in this isolated copy.
  let source=read(dir,'runtime.mjs');
  source=source.replace('      const eligible=!duration.allowed?',
   '      this.entryStudy={raw:original66,final:observation,probability:preliminary};\n      const eligible=!duration.allowed?');
  put(dir,'runtime.mjs',source);
  variants[name]=(await import(pathToFileURL(join(dir,core,'runtime.mjs')))).DemoTradingRuntime;
 }
 const fixture=JSON.parse(readFileSync(join(root,'tests/fixtures/sentinel-continuation-prices.json')));
 const tape=fixture.quoteHistory,cases=[];
 for(const engine of ['automatic','fibonacci_retest','trend','support_resistance','smart_confluence'])
 for(const durationMs of [5000,10000,15000,30000,60000,120000,300000])for(const latencyMs of [0,600]){
  const results={};
  for(const [name,Runtime] of Object.entries(variants)){
   const runtime=new Runtime({enableVNext:true,forecastModel:'short-probability-v1'});
   runtime.patchSettings({engine,orderDurationMs:durationMs},'offline-ablation');
   const entries=[],verdicts=[],reasonCounts={};let firedAt=0;
   for(let i=0;i<tape.length;i++){
    const q=tape[i],now=q.ts+latencyMs;
    const out=runtime._signalValidationGate({analysis:{},settings:runtime.settings,now,
     snap:{provider:'iq_option',price:q.price,quoteTs:q.ts,quoteHistory:tape.slice(0,i+1),
      candles:fixture.candles,historicalCandlesVerified:true,payout:null}});
    const v=runtime.entryStudy;
    verdicts.push({at:q.ts,rawReady:v.raw.ready,rawSide:v.raw.side,rawReason:v.raw.reason,
     ready:v.final.ready,side:v.final.side,reason:v.final.reason});
    reasonCounts[v.final.reason]=(reasonCounts[v.final.reason]||0)+1;
    const a=out.analysis?.vnext?.futureEntryAnchor;
    if(a?.phase!=='fired'||a.entryTriggeredAt===firedAt)continue;
    firedAt=a.entryTriggeredAt;const exit=tape.find(x=>x.ts>=a.exitAt&&x.ts-a.exitAt<=1500);
    const delta=exit?exit.price-q.price:null;
    entries.push({at:firedAt,quoteAt:q.ts,side:a.side,entry:q.price,exitAt:a.exitAt,exit:exit?.price??null,
     reason:v.final.reason,outcome:delta==null?'pending':delta===0?'tie':(delta>0)===(a.side==='CALL')?'win':'loss'});
   }
   results[name]={entries,reasonCounts,verdicts};
  }
  const baseline=results['107'],release=results['112'];
  const differences=baseline.verdicts.flatMap((old,i)=>{
   const actual=release.verdicts[i];return old.ready!==actual.ready||old.side!==actual.side||old.reason!==actual.reason?[{before:old,after:actual}]:[];
  });
  for(const r of Object.values(results))delete r.verdicts;
  cases.push({engine,durationMs,latencyMs,differences,results});
 }
 console.log(JSON.stringify({baseline:base,released,releaseArchive,
  source:'tests/fixtures/sentinel-continuation-prices.json',
  provenance:'Existing recorded-price fixture committed at d29114f2; asset/provider metadata not recorded. Not the recent trade journals.',
  quotes:tape.length,candles:fixture.candles.length,
  limits:['Only historical candles already closed at each decision are admitted by the normal engine.',
   'Only one 179-second price trace; horizons beyond its end are pending, not losses.',
   'Assumed 600ms evaluation delay, not actual broker fill or Windows latency.',
   'Ablations diagnose code paths; their results do not establish general trading accuracy.'],cases},null,2));
}finally{rmSync(temporary,{recursive:true,force:true});}
