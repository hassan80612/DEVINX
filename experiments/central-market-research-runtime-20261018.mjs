import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function centralMarketResearchRuntime({regimePolicy=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'sentinel-central-market-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),dir,{recursive:true});
 for(const name of ['closed-candle-dmi-20261018.mjs','central-market-decision-20261018.mjs'])
  writeFileSync(join(dir,name),readFileSync(new URL('./'+name,import.meta.url)));
 const file=join(dir,'now-opportunity-engine.mjs'),source=readFileSync(file,'utf8');
 const from=source.indexOf('  const candleLocated=applyCandleLevelRoute('),to=source.indexOf('  delete located.pendingForecast;',from);
 if(from<0||to<from)throw Error('Unexpected engine source');
 writeFileSync(file,"import {resolveCentralMarketDecision} from './central-market-decision-20261018.mjs';\n"+
  source.slice(0,from)+`  const located=resolveCentralMarketDecision({decision,historical,structure,candles,...input,regimePolicy:${regimePolicy}});\n`+source.slice(to));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(dir,'runtime.mjs')));
 const {resolveCentralMarketDecision}=await import(pathToFileURL(join(dir,'central-market-decision-20261018.mjs')));
 return {DemoTradingRuntime,resolveCentralMarketDecision,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
