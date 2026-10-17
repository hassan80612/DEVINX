import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function observedSamplingResearchRuntime({mode='bucket',moment=false,requireForecast=true}={}){
 const path=mkdtempSync(join(tmpdir(),'sentinel-observed-sampling-research-'));
 cpSync(new URL('../sentinel-trading-lab/agent/src/core/',import.meta.url),path,{recursive:true});
 const file=join(path,'thirty-second-expiry-direction.mjs'),before=readFileSync(file,'utf8');
 let after;
 if(mode==='one-second'){
  const needle='t-rows[j].ts<=500';if(before.split(needle).length!==2)throw Error('Unexpected sampling source');
  after=before.replace(needle,'t-rows[j].ts<1000');
 }else if(mode==='bucket'){
  const from=before.indexOf(' const points=[];let j=rows.length-1;'),to=before.indexOf(' if(points.length<60)',from);
  if(from<0||to<0)throw Error('Unexpected sampling block');
  after=before.slice(0,from)+`
 const seconds=new Map();
 for(const q of rows)seconds.set(Math.floor(q.ts/1000),q);
 const points=[...seconds.values()].map(q=>({t:(q.ts-quoteAt)/1000,y:Math.log(q.price/price)}));
`+before.slice(to);
 }else throw Error('Unknown sampling mode');
 writeFileSync(file,after);
 if(moment){
  for(const name of ['candle-entry-moment-20261017.mjs','verified-candle-source-20261017.mjs'])writeFileSync(join(path,name),readFileSync(new URL('./'+name,import.meta.url)));
  const runtimeFile=join(path,'runtime.mjs'),original=readFileSync(runtimeFile,'utf8');
  const needle='const duration=brokerDurationGuard({snap,settings,now});';
  if(original.split(needle).length!==2)throw Error('Unexpected runtime integration');
  const replacement=`
      if(${requireForecast}&&observation.ready&&!(Number.isFinite(observation.expectedLogMove)&&Number.isFinite(observation.predictedPrice)&&observation.horizonMs===30000&&
        (observation.expectedLogMove>0?'CALL':'PUT')===observation.side)){
        observation={...observation,ready:false,provisionalSide:observation.side,side:null,reason:'research-moment-without-valid-expiry-projection'};
      }
      observation=candleEntryMoment({candidate:observation,snap,now,durationMs:settings.orderDurationMs});
      `+needle;
  writeFileSync(runtimeFile,"import {candleEntryMoment} from './candle-entry-moment-20261017.mjs';\n"+original.replace('const observation=analyzeNowOpportunity({','let observation=analyzeNowOpportunity({').replace(needle,replacement));
 }
 const {DemoTradingRuntime}=await import(pathToFileURL(join(path,'runtime.mjs')));
 const {thirtySecondCycleForecast}=await import(pathToFileURL(file));
 return {DemoTradingRuntime,thirtySecondCycleForecast,cleanup:()=>rmSync(path,{recursive:true,force:true})};
}
