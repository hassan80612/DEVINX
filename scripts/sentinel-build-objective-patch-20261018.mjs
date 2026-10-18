import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {binaryObjectiveResearchRuntime} from '../experiments/binary-objective-research-runtime-20261018.mjs';
const c=await binaryObjectiveResearchRuntime({expiryScoring:'asof'});
try{
 mkdirSync(new URL('../patches/',import.meta.url),{recursive:true});
 let patch='';
 for(const name of ['causal-pattern-direction.mjs','completed-expiry-direction.mjs','runtime.mjs']){
  try{execFileSync('diff',['-u','--label','a/sentinel-trading-lab/agent/src/core/'+name,
   '--label','b/sentinel-trading-lab/agent/src/core/'+name,
   new URL('../sentinel-trading-lab/agent/src/core/'+name,import.meta.url).pathname,join(c.corePath,name)],{encoding:'utf8'});}
  catch(e){if(e.status!==1)throw e;patch+=e.stdout;}
 }
 const helper=readFileSync(new URL('../experiments/observed-expiry-quote-20261018.mjs',import.meta.url),'utf8').trimEnd();
 patch+='--- /dev/null\n+++ b/sentinel-trading-lab/agent/src/core/observed-expiry-quote-20261018.mjs\n@@ -0,0 +1,'+
  helper.split('\n').length+' @@\n'+helper.split('\n').map(x=>'+'+x).join('\n')+'\n';
 writeFileSync(new URL('../patches/sentinel-binary-objective-and-expiry-20261018.patch',import.meta.url),patch);
 console.log('Prepared isolated consistency patch; published Agent source is unchanged.');
}finally{c.cleanup();}
