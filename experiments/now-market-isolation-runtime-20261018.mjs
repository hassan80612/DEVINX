import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function nowMarketIsolationRuntime(){
 const dir=mkdtempSync(join(tmpdir(),'sentinel-market-isolation-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),dir,{recursive:true});
 const engine=join(dir,'now-opportunity-engine.mjs');let s=readFileSync(engine,'utf8');
 if(s.includes("provider=null,engineId='automatic'")&&readFileSync(join(dir,'runtime.mjs'),'utf8').includes('const currentWindowOutcomes=')){
  const {DemoTradingRuntime}=await import(pathToFileURL(join(dir,'runtime.mjs')));
  return {DemoTradingRuntime,corePath:dir,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
 }
 const replace=(source,from,to)=>{if(source.split(from).length!==2)throw Error('Unexpected source: '+from);return source.replace(from,to);};
 s=replace(s,"quoteAt=null,asset='UNKNOWN',engineId='automatic',durationMs=30000}={}){",
  "quoteAt=null,asset='UNKNOWN',provider=null,engineId='automatic',durationMs=30000}={}){");
 s=replace(s,"const key=[String(asset).toUpperCase(),String(engineId),horizon].join('|');",
  "const key=[...(provider==null?[]:[String(provider).toLowerCase()]),String(asset).toUpperCase(),String(engineId),horizon].join('|');");
 writeFileSync(engine,s);
 const file=join(dir,'runtime.mjs');s=readFileSync(file,'utf8');
 const begin=s.indexOf("if(settings.engine&&this.forecastModel==='now-structural-v1'){");
 const finish=s.indexOf("      return ",s.indexOf('const analysisResult=',begin));
 if(begin<0||finish<begin)throw Error('Unknown NOW branch');
 let branch=s.slice(begin,finish);
 branch=replace(branch,'asset:settings.asset,engineId:settings.engine,durationMs:settings.orderDurationMs',
  'asset:settings.asset,provider:snap.provider,engineId:settings.engine,durationMs:settings.orderDurationMs');
 branch=replace(branch,'windowId:next.entryTriggeredAt,asset:next.asset,',
  "windowId:next.entryTriggeredAt,asset:next.asset,provider:snap.provider??null,entryReason:observation.reason,");
 branch=replace(branch,'if(outcome.verified||Number(outcome.exitAt)>now)continue;',
  `if(outcome.verified||Number(outcome.exitAt)>now)continue;
        if(String(outcome.asset).toUpperCase()!==String(settings.asset).toUpperCase()||
          String(outcome.provider??'').toLowerCase()!==String(snap.provider??'').toLowerCase())continue;`);
 branch=replace(branch,'outcome.verified=true;outcome.observedExitPrice=Number(point.price);',
  'outcome.verified=true;outcome.observedExitPrice=Number(point.price);outcome.observedExitAt=Number(point.ts);');
 branch=replace(branch,"const vnext={\n        mode:'now'",`const currentWindowOutcomes=this.vnextWindowOutcomes.filter(x=>
        String(x.asset).toUpperCase()===String(settings.asset).toUpperCase()&&
        String(x.provider??'').toLowerCase()===String(snap.provider??'').toLowerCase()&&
        x.engineId===settings.engine&&Number(x.periodSeconds)===Number(settings.orderDurationMs)/1000);
      const vnext={
        mode:'now'`);
 const pattern="this.vnextWindowOutcomes.filter(x=>x.verified&&x.forecastMode==='now'";
 if(branch.split(pattern).length!==6)throw Error('Unexpected NOW counters');
 branch=branch.split(pattern).join("currentWindowOutcomes.filter(x=>x.verified&&x.forecastMode==='now'");
 s=s.slice(0,begin)+branch+s.slice(finish);writeFileSync(file,s);
 const {DemoTradingRuntime}=await import(pathToFileURL(file));
 return {DemoTradingRuntime,corePath:dir,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
