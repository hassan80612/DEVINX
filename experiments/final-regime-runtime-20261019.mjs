import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
export async function finalRegimeRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-final-regime-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
 cpSync(new URL('./final-regime-arbiter-20261019.mjs',import.meta.url),join(root,'final-regime-arbiter-20261019.mjs'));
 const file=join(root,'now-opportunity-engine.mjs');let s=readFileSync(file,'utf8');
 const anchor='  return {...located,engineId,qualityPolicy,';
 if(s.split(anchor).length!==2)throw Error('Expected one final decision boundary');
 s="import {finalRegimeArbiter} from './final-regime-arbiter-20261019.mjs';\n"+s.replace(anchor,
  '  const arbitrated=finalRegimeArbiter({candidate:located,projection:decision,...input});\n  return {...arbitrated,engineId,qualityPolicy,');
 writeFileSync(file,s);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(root,'runtime.mjs')));
 return {DemoTradingRuntime,root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
