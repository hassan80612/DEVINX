import {readFile,writeFile} from 'node:fs/promises';
import {analyzePrediction} from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import {PredictionInputState,predictionInput,fuseForecastEvidence,EVIDENCE_GROUPS} from '../sentinel-trading-lab/agent/src/core/forecast-evidence.mjs';

// Direction study only. No broker, orders, model fitting, threshold search, or
// conversion of offline predictions into entry authorization.
const input=process.argv[2]||'/tmp/sentinel-real-events.jsonl';
const events=(await readFile(input,'utf8')).trim().split('\n').map(JSON.parse);
const markets=events.filter(e=>e.type==='market').sort((a,b)=>a.ts-b.ts);
const context=new PredictionInputState(),quotes=[],seen=new Set(),frames=[];
let candles=[],nextOrigin=0,chosenPeriod=null,ordinal=0;
const counts={marketEvents:markets.length,checkpoints:0,origins:0,staleCurrentOrigins:0,freshUnavailable:0,periodSwitches:0,futureQuotesRejected:0};
function periodState(period,now){
 const n=predictionInput({candles,quoteHistory:[],now,periodSeconds:period});
 const end=n.candles.length?Math.max(...n.candles.map(c=>Number(c.to)))*1000:0;
 return {period,bars:n.candles.length,ageMs:now-end,latestTo:end,usable:n.candles.length>=35&&now-end<=period*2000};
}
function refreshedSnapshot(now,period){
 const rows=candles.map(c=>({...c}));
 for(const c of rows){
  if(Number(c.from)*1000>now||Number(c.to)*1000<=now)continue;
  const available=quotes.filter(q=>q.ts>=Number(c.from)*1000&&q.ts<=now);
  if(!available.length)continue;
  c.close=available.at(-1).price;c.high=Math.max(Number(c.high),...available.map(q=>q.price));c.low=Math.min(Number(c.low),...available.map(q=>q.price));
 }
 return {candles:rows,quoteHistory:quotes.filter(q=>now-q.ts<=180000).slice(-900),now,periodSeconds:period};
}
for(const e of markets){
 if(e.candles){candles=e.candles.filter(c=>Number(c.from)*1000<=e.ts);counts.checkpoints++;}
 for(const q of e.quotes||[]){
  if(q.ts>e.ts){counts.futureQuotesRejected++;continue;}
  if(seen.has(q.ts))continue;seen.add(q.ts);quotes.push({ts:Number(q.ts),price:Number(q.price)});
 }
 quotes.sort((a,b)=>a.ts-b.ts);
 if(!nextOrigin)nextOrigin=Math.ceil(e.ts/30000)*30000;
 if(e.ts<nextOrigin)continue;
 // No interpolation through a feed gap. Each origin is an actual received frame.
 while(nextOrigin<=e.ts)nextOrigin+=30000;
 if(candles.length<35||!quotes.length||e.ts-quotes.at(-1).ts>2500)continue;
 const pin=context.prepare({candles,quoteHistory:quotes,now:e.ts},e.provider+'|'+e.asset).inputQuality.periodSeconds;
 if(pin==null)continue;
 const original=periodState(pin,e.ts);
 const periods=[...new Set(candles.map(c=>Number(c.to)-Number(c.from)))].sort((a,b)=>a-b);
 const states=periods.map(p=>periodState(p,e.ts));
 const prior=chosenPeriod==null?null:states.find(s=>s.period===chosenPeriod);
 const selected=prior?.usable?prior:states.find(s=>s.usable);
 if(!selected){counts.freshUnavailable++;continue;}
 if(chosenPeriod!=null&&selected.period!==chosenPeriod)counts.periodSwitches++;
 chosenPeriod=selected.period;
 if(!original.usable)counts.staleCurrentOrigins++;
 const args={strategy:e.settings.strategy,predictionStrategies:[e.settings.strategy,e.settings.strategy2,e.settings.strategy3].filter(id=>id&&id!=='none'),minConfidence:e.settings.minConfidence,durationMs:e.settings.orderDurationMs,quoteTs:e.quoteTs,experimentalTiming:false};
 const current=analyzePrediction({...args,...refreshedSnapshot(e.ts,pin)});
 const fresh=analyzePrediction({...args,...refreshedSnapshot(e.ts,selected.period)});
 const rows=[];
 for(const seconds of [30,60]){
  for(const [label,a] of [['current-base',current],['fresh-base',fresh]]){
   const p=a.entryPlanner?.horizons?.[seconds];
   const fs=Object.entries(p?.evidenceFamilies||{}).map(([key,f])=>({key,value:f.signal,weight:f.weight,available:true})),fusion=fuseForecastEvidence(fs);
   rows.push({model:label,seconds,side:p?.bias,signal:p?.signal,ready:p?.directionReady===true,confidence:p?.confidence,callProbability:Number(p?.callProbability)/100,familyValues:Object.keys(EVIDENCE_GROUPS).map(key=>fusion.rows.find(f=>f.family===key)?.value??0)});
  }
  const p=fresh.entryPlanner?.horizons?.[seconds];
  if(!p)continue;
  const features=Object.entries(p.evidenceFamilies||{}).map(([key,f])=>({key,value:f.signal,weight:f.weight,available:true}));
  const full=fuseForecastEvidence(features),retain=Math.abs(full.signal)>1e-12?Number(p.signal)/full.signal:0;
  if(retain<-.000001)throw new Error('attenuation unexpectedly reversed direction');
  for(const [family,keys] of Object.entries(EVIDENCE_GROUPS)){
   const ablated=fuseForecastEvidence(features.filter(f=>!keys.includes(f.key))),signal=ablated.signal*retain;
   rows.push({model:'fresh-without-'+family,seconds,side:Math.abs(signal)>=.025?(signal>0?'CALL':'PUT'):'NEUTRO',signal,ready:null,confidence:null});
  }
 }
 frames.push({at:e.ts,price:Number(e.quote),asset:e.asset,originalPeriod:pin,originalAgeMs:original.ageMs,freshPeriod:selected.period,freshAgeMs:selected.ageMs,sourceFile:e._file,sourceLine:e._line,rows});
 counts.origins++;
 if(++ordinal%100===0)console.log(JSON.stringify({progress:ordinal,lastOrigin:e.ts}));
}
// Use the same first-observed quote for features and labels when a timestamp
// was repeated with conflicting prices. Do not silently change the label feed.
const actualQuotes=quotes;
function closest(ts){
 let l=0,h=actualQuotes.length;while(l<h){const m=(l+h)>>1;if(actualQuotes[m].ts<ts)l=m+1;else h=m;}
 const choices=actualQuotes.slice(Math.max(0,l-1),l+1),q=choices.sort((a,b)=>Math.abs(a.ts-ts)-Math.abs(b.ts-ts))[0];
 return q&&Math.abs(q.ts-ts)<=1500?q:null;
}
// Boundaries use origin count only, never outcomes. The last block has already
// been inspected in the incident audit; it is not a new unseen holdout.
const split1=Math.floor(frames.length*.6),split2=Math.floor(frames.length*.8),scored=[];
let next60=-Infinity;
for(let i=0;i<frames.length;i++){
 const frame=frames[i],partition=i<split1?'first-60pct':i<split2?'next-20pct':'last-20pct';
 const allow60=frame.at>=next60;if(allow60)next60=frame.at+60000;
 for(const r of frame.rows){
  if(r.seconds===60&&!allow60)continue;
  const q=closest(frame.at+r.seconds*1000),directional=['CALL','PUT'].includes(r.side),delta=q?q.price-frame.price:null,draw=q&&Math.abs(delta)<=Math.abs(frame.price)*1e-10;
  scored.push({...r,at:frame.at,price:frame.price,partition,originalPeriod:frame.originalPeriod,freshPeriod:frame.freshPeriod,settledAt:q?.ts??null,settledPrice:q?.price??null,won:directional&&q&&!draw?(r.side==='CALL'?delta>0:delta<0):null,reason:!directional?'no-direction':!q?'missing-expiry':draw?'draw':null});
 }
}
function score(rows){
 const resolved=rows.filter(r=>r.won!==null),wins=resolved.filter(r=>r.won).length;
 return {origins:rows.length,directional:rows.filter(r=>['CALL','PUT'].includes(r.side)).length,resolved:resolved.length,wins,losses:resolved.length-wins,winRate:resolved.length?100*wins/resolved.length:null,neutral:rows.filter(r=>r.reason==='no-direction').length,missingExpiry:rows.filter(r=>r.reason==='missing-expiry').length,draws:rows.filter(r=>r.reason==='draw').length};
}
const models=[...new Set(scored.map(r=>r.model))],summary=[];
for(const seconds of [30,60])for(const partition of ['first-60pct','next-20pct','last-20pct','all']){
 const common=scored.filter(r=>r.seconds===seconds&&(partition==='all'||r.partition===partition));
 summary.push({seconds,partition,models:models.map(model=>({model,...score(common.filter(r=>r.model===model))}))});
}
const comparisons=[];
for(const seconds of [30,60])for(const model of models.filter(m=>m!=='current-base')){
 const base=scored.filter(r=>r.seconds===seconds&&r.model==='current-base'&&r.won!==null),other=new Map(scored.filter(r=>r.seconds===seconds&&r.model===model&&r.won!==null).map(r=>[r.at,r]));
 const both=base.filter(r=>other.has(r.at));
 comparisons.push({seconds,model,commonOrigins:both.length,baseWins:both.filter(r=>r.won).length,candidateWins:both.filter(r=>other.get(r.at).won).length,correctedLosses:both.filter(r=>!r.won&&other.get(r.at).won).length,spoiledWins:both.filter(r=>r.won&&!other.get(r.at).won).length});
}
const output={counts,partitionBoundaries:{firstEnd:frames[split1-1]?.at,secondEnd:frames[split2-1]?.at,lastEnd:frames.at(-1)?.at},summary,comparisons,frames,scored,limitations:['One asset/session, previously inspected data; no new unseen holdout.','Direction at common received origins; these are not operational entry signals or broker orders.','Recorded checkpoints and quote cadence cannot exactly restore the installed runtime learning and intrabar state.','Family ablations evaluate direction only; their confidence and readiness have not been reimplemented.','Fresh base selects only an entire available current interval; never splits OHLC into invented minute candles.','30s and 60s results reuse price paths; do not sum horizons or partitions as independent evidence.']};
await writeFile('/tmp/sentinel-real-direction-study.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({counts,partitionBoundaries:output.partitionBoundaries,summary,comparisons},null,2));
