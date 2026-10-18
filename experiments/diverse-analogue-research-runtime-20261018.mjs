// Research only. Same quote window and fallback; no collection timer.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function diverseAnalogueResearchRuntime(){
 const dir=mkdtempSync(join(tmpdir(),'sentinel-diverse-analogue-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),dir,{recursive:true});
 const file=join(dir,'causal-pattern-direction.mjs');let source=readFileSync(file,'utf8');
 const replace=(from,to)=>{if(source.split(from).length!==2)throw Error('Unexpected analogue source: '+from);source=source.replace(from,to);};
 replace('training.push({diff,shortDiff,side:','training.push({at:time,diff,shortDiff,side:');
 replace('const top=training.slice(0,Math.min(12,training.length));',`const top=[];
 for(const example of training){
  if(example.shortDiff>1||!example.side)continue;
  if(top.every(other=>Math.abs(other.at-example.at)>=expiry))top.push(example);
 }
 // Three is the smallest odd vote that is more than one comparison pair.
 // If evidence is sparse, return to the existing structural route immediately.
 if(top.length<3)return empty('insufficient-distinct-comparable-outcomes');`);
 replace('analogues:training.length,selected:top.length,strength,','analogues:training.length,selected:top.length,strength,researchExamples:top,');
 writeFileSync(file,source);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(dir,'runtime.mjs')));
 const {causalPatternDirection}=await import(pathToFileURL(file));
 return {DemoTradingRuntime,causalPatternDirection,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
