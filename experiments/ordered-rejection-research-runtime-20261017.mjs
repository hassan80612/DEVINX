// Research only: a rejection touch must belong to the approach being assessed.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function orderedRejectionResearchRuntime(){
 const path=mkdtempSync(join(tmpdir(),'sentinel-ordered-rejection-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const historical=join(path,'historical-price-structure.mjs'),before=readFileSync(historical,'utf8');
 const marker='const reactions=[];';if(before.split(marker).length!==2)throw Error('Unexpected historical source');
 let after=before.replace(marker,`const approachStart=q.findLast(x=>x.ts<=ts-6000)?.ts??ts-6000;
 const approached=q.filter(x=>x.ts>=approachStart);
 const reactionLow=Math.min(...approached.map(x=>x.price)),reactionHigh=Math.max(...approached.map(x=>x.price));
 const reactions=[];`);
 const from=after.indexOf('const rejectionUp='),to=after.indexOf('const side=',from);
 if(from<0||to<0)throw Error('Unexpected rejection source');
 after=after.slice(0,from)+after.slice(from,to).replace(/\blo\b/g,'reactionLow').replace(/\bhi\b/g,'reactionHigh')+after.slice(to);
 writeFileSync(historical,after);
 const route=join(path,'candle-level-map.mjs'),source=readFileSync(route,'utf8');
 const needle='const low=Math.min(...q.map(p=>p.price)),high=Math.max(...q.map(p=>p.price));';
 if(source.split(needle).length!==2)throw Error('Unexpected candle route source');
 writeFileSync(route,source.replace(needle,`const approachStart=q.findLast(p=>p.ts<=ts-6000)?.ts??ts-6000;
 const approached=q.filter(p=>p.ts>=approachStart);
 const low=Math.min(...approached.map(p=>p.price)),high=Math.max(...approached.map(p=>p.price));`));
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 const {applyHistoricalPriceStructure}=await import(pathToFileURL(historical));
 const {applyCandleLevelRoute}=await import(pathToFileURL(route));
 return {DemoTradingRuntime,applyHistoricalPriceStructure,applyCandleLevelRoute,corePath:path,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
