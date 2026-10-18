import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function currentImpulseResearchRuntime({stage='final'}={}){
 const path=mkdtempSync(join(tmpdir(),'sentinel-current-impulse-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 writeFileSync(join(path,'current-impulse-confirmation-20261017.mjs'),readFileSync(new URL('./current-impulse-confirmation-20261017.mjs',import.meta.url)));
 if(stage==='final'){
  const file=join(path,'runtime.mjs'),source=readFileSync(file,'utf8'),needle='const duration=brokerDurationGuard({snap,settings,now});';
  if(source.split(needle).length!==2)throw Error('Unexpected runtime source');
  writeFileSync(file,"import {qualifyCurrentImpulse} from './current-impulse-confirmation-20261017.mjs';\n"+
   source.replace('const observation=analyzeNowOpportunity({','let observation=analyzeNowOpportunity({').replace(needle,
    'observation=qualifyCurrentImpulse({candidate:observation,quoteHistory:snap.quoteHistory,quoteAt:snap.quoteTs,price:snap.price,now,durationMs:settings.orderDurationMs});\n      '+needle));
 }else if(stage==='base'){
  const file=join(path,'now-opportunity-engine.mjs'),source=readFileSync(file,'utf8'),needle='const strength=Math.min(100,Math.round(100*Math.min(1,';
  if(source.split(needle).length!==2)throw Error('Unexpected impulse source');
  writeFileSync(file,"import {currentImpulseConfirmation} from './current-impulse-confirmation-20261017.mjs';\n"+source.replace(needle,
   "if(seconds===30&&!currentImpulseConfirmation({quoteHistory:quotes,quoteAt,price,now,side}).confirmed)return waiting('research-continuation-without-current-followthrough');\n "+needle));
 }else throw Error('Unknown integration stage');
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
