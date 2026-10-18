// RESEARCH ONLY. Never imported by the production Agent or its bot.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function independentExpiryRuntime(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-independent-expiry-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'completed-expiry-direction.mjs');let source=readFileSync(file,'utf8');
 const patches=[
  ['this.completed=0;this.lastIssued=-Infinity;this.lastQuoteAt=-Infinity;this.cache=null;',
   'this.completed=0;this.lastIssued=-Infinity;this.lastIssuedExpiry=-Infinity;this.researchTrials=[];this.lastQuoteAt=-Infinity;this.cache=null;'],
  ['if(ts-this.lastIssued>=5000){','if(ts>=this.lastIssuedExpiry){'],
  ['this.lastIssued=ts;this.pending.push({at:ts,dueAt:projectionTargetAt==null?ts+30000:Number(projectionTargetAt),',
   'const dueAt=projectionTargetAt==null?ts+30000:Number(projectionTargetAt);this.lastIssued=ts;this.lastIssuedExpiry=dueAt;this.researchTrials.push({at:ts,dueAt});this.pending.push({at:ts,dueAt,']
 ];
 for(const [before,after] of patches){if(source.split(before).length!==2)throw Error('Unexpected selector source');source=source.replace(before,after);}
 source+="\nObject.defineProperty(CompletedExpiryDirection.prototype,'researchCounts',{get(){return {trials:this.researchTrials.length,completed:this.completed,overlaps:this.researchTrials.slice(1).filter((p,i)=>p.at<this.researchTrials[i].dueAt).length};}});\n";
 writeFileSync(file,source);
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 const {CompletedExpiryDirection}=await import(pathToFileURL(file));
 return{DemoTradingRuntime,CompletedExpiryDirection,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
