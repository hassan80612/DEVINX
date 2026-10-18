import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function conditionalOppositeRuntime(){
 const root=mkdtempSync(join(tmpdir(),'sentinel-conditional-opposite-'));
 try{
  cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),root,{recursive:true});
  cpSync(new URL('./conditional-opposite-signal-20261018.mjs',import.meta.url),join(root,'conditional-opposite-signal-20261018.mjs'));
  const path=join(root,'now-opportunity-engine.mjs'),source=readFileSync(path,'utf8');
  const block=`return {...located,engineId,qualityPolicy,
   contextStrategy:engineId==='automatic'?(levelReaction?'support_resistance':context.strategy):engineId,
   marketShape:levelReaction?'historical-level-'+levelReaction.kind:context.marketShape,
   signalOwner:'shared-market-base'};`;
  if(source.split(block).length!==2)throw Error('Unexpected released final decision source');
  const expression=block.slice('return '.length,-1);
  writeFileSync(path,"import {conditionalOppositeSignal} from './conditional-opposite-signal-20261018.mjs';\n"+
   source.replace(block,`return conditionalOppositeSignal({...input,candidate:${expression}});`));
  const runtime=await import(pathToFileURL(join(root,'runtime.mjs')));
  const engine=await import(pathToFileURL(path));
  return {...runtime,...engine,root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
 }catch(e){rmSync(root,{recursive:true,force:true});throw e;}
}
