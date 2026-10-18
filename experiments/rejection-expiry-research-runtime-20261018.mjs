import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function rejectionExpiryResearchRuntime({mode='expiry-agreement'}={}){
 if(!['expiry-agreement','sequence-only'].includes(mode))throw Error('Unknown mode');
 const path=mkdtempSync(join(tmpdir(),'sentinel-rejection-expiry-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 writeFileSync(join(path,'rejection-expiry-agreement-20261018.mjs'),readFileSync(new URL('./rejection-expiry-agreement-20261018.mjs',import.meta.url)));
 const file=join(path,'now-opportunity-engine.mjs'),source=readFileSync(file,'utf8');
 const marker='delete located.pendingForecast;';
 if(source.split(marker).length!==2)throw Error('Unexpected engine source');
 writeFileSync(file,"import {qualifyRejectionExpiry} from './rejection-expiry-agreement-20261018.mjs';\n"+
  source.replace('const located=applyObservedLevelSequence(','let located=applyObservedLevelSequence(')
  .replace(marker,`located=qualifyRejectionExpiry({candidate:located,original,decision,durationMs,mode:'${mode}'});\n  ${marker}`));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
