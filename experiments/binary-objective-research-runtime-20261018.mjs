// Research only: binary hit-rate direction must use weighted class outcomes,
// not the mean size of historical price changes. Admission/weights unchanged.
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function binaryObjectiveResearchRuntime({trace=false,vote=true,expiryScoring='released'}={}){
 if(!['released','asof'].includes(expiryScoring))throw Error('Invalid expiry scoring');
 const path=mkdtempSync(join(tmpdir(),'sentinel-binary-objective-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'causal-pattern-direction.mjs'),source=readFileSync(file,'utf8');
 const needle='const direction=signed(weighted),strength=Math.abs(winsCall-winsPut)/(sum||1);';
 if(source.split(needle).length!==2)throw Error('Unexpected analogue source');
 let after=vote?source.replace(needle,'const direction=signed(winsCall-winsPut),strength=Math.abs(winsCall-winsPut)/(sum||1);'):source;
 if(trace)after=after.replace('analogues:training.length,selected:top.length,strength,',
  'analogues:training.length,selected:top.length,strength,researchBinary:{winsCall,winsPut,sum,meanMoveSide:signed(weighted),selectedExamples:top},');
 writeFileSync(file,after);
 if(expiryScoring==='asof'){
  writeFileSync(join(path,'observed-expiry-quote-20261018.mjs'),readFileSync(new URL('./observed-expiry-quote-20261018.mjs',import.meta.url)));
  const selector=join(path,'completed-expiry-direction.mjs'),old=readFileSync(selector,'utf8');
  const marker="if(ts>p.dueAt+1000||spot===p.price)continue;\n    const side=spot>p.price?'CALL':'PUT';";
  if(old.split(marker).length!==2)throw Error('Unexpected selector outcome source');
  writeFileSync(selector,"import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';\n"+
   old.replace(marker,"const point=observedExpiryQuote({quoteHistory,currentQuote:{ts,price:spot,receivedAt:now},dueAt:p.dueAt,now});\n    if(!point||point.price===p.price)continue;\n    const side=point.price>p.price?'CALL':'PUT';"));
  const runtime=join(path,'runtime.mjs'),before=readFileSync(runtime,'utf8');
  const find="const point=(snap.quoteHistory||[]).find(q=>\n          Number(q.ts)>=outcome.exitAt&&Number(q.ts)<=outcome.exitAt+1000);";
  if(before.split(find).length!==2)throw Error('Unexpected runtime outcome source');
  writeFileSync(runtime,"import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';\n"+
   before.replace(find,'const point=observedExpiryQuote({quoteHistory:snap.quoteHistory,currentQuote:{ts:Number(snap.quoteTs),price:Number(snap.price),receivedAt:now},dueAt:outcome.exitAt,now});'));
 }
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 const {causalPatternDirection}=await import(pathToFileURL(file));
 const {CompletedExpiryDirection}=await import(pathToFileURL(join(path,'completed-expiry-direction.mjs')));
 return {DemoTradingRuntime,causalPatternDirection,CompletedExpiryDirection,corePath:path,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
