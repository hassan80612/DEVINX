// RESEARCH ONLY. Both narrow/wide forecasters and their completed-outcome
// selector run with the proposed central equation in an isolated core copy.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function forecastLevelResearchRuntime(mode){
 if(!['level','residual'].includes(mode))throw Error('Unknown forecast mode');
 const path=mkdtempSync(join(tmpdir(),'sentinel-forecast-level-research-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'thirty-second-expiry-direction.mjs'),before=readFileSync(file,'utf8');
 const needle='const expectedLogMove=selected.predict(horizonMs/1000)-selected.predict(0);';
 if(before.split(needle).length!==2)throw Error('Unexpected forecast source');
 const replacement=mode==='level'?
  'const expectedLogMove=selected.predict(horizonMs/1000);':`
 const residualByTime=new Map(points.map(p=>[p.t,p.y-selected.predict(p.t)]));
 let xx=0,xy=0;
 for(const [at,error] of residualByTime){
  const later=residualByTime.get(at+horizonMs/1000);
  if(later===undefined)continue;
  xx+=error*error;xy+=error*later;
 }
 const persistence=xx>1e-20?Math.max(0,Math.min(1,xy/xx)):1;
 const expectedLogMove=selected.predict(horizonMs/1000)-persistence*selected.predict(0);`;
 writeFileSync(file,before.replace(needle,replacement));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 return {DemoTradingRuntime,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
