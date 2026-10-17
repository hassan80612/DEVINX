import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function candleMomentResearchRuntime(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-candle-moment-research-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 for(const [source,name] of [['candle-entry-moment-20261017.mjs','candle-entry-moment-20261017.mjs'],['verified-candle-source-20261017.mjs','verified-candle-source-20261017.mjs']])writeFileSync(join(path,name),readFileSync(new URL('./'+source,import.meta.url)));
 const file=join(path,'runtime.mjs'),before=readFileSync(file,'utf8');
 const needle='const duration=brokerDurationGuard({snap,settings,now});';
 if(before.split(needle).length!==2||before.split('const observation=analyzeNowOpportunity({').length!==2)throw Error('Unexpected runtime source');
 const after="import {candleEntryMoment} from './candle-entry-moment-20261017.mjs';\n"+
  before.replace('const observation=analyzeNowOpportunity({','let observation=analyzeNowOpportunity({').replace(needle,
   'observation=candleEntryMoment({candidate:observation,snap,now,durationMs:settings.orderDurationMs});\n      '+needle);
 writeFileSync(file,after);
 const {DemoTradingRuntime}=await import(pathToFileURL(file));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
