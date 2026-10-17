// Isolated source copy: released files are never changed by this experiment.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function stabilityResearchRuntime(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-stability-research-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'now-opportunity-engine.mjs'),before=readFileSync(file,'utf8');
 const needle='const selectedForecast=forecast?.ready&&decision.ready?decision:forecast;';
 if(before.split(needle).length!==2)throw Error('Unexpected source: review candidate integration before testing');
 writeFileSync(file,before.replace(needle,'const selectedForecast=decision.projectionSuppressed?null:forecast?.ready&&decision.ready?decision:forecast;'));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
