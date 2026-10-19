// Read-only reproduction of the EXACT 13.9.55 prediction pipeline from
// recorded browser quotes. All predictors receive past-only data.
// Outcomes are read AFTER expiry and are never passed back to decision logic.
// The two quote datasets below are the SAME 9-minute video, not independent.
// Does not modify or write Sentinel state, orders, and production.
import {readFileSync} from 'node:fs';
import {analyzeNowOpportunity,advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {thirtySecondCycleForecast} from '../sentinel-trading-lab/agent/src/core/thirty-second-expiry-direction.mjs';
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {causalPatternDirection} from '../sentinel-trading-lab/agent/src/core/causal-pattern-direction.mjs';
import {observedNoise} from '../sentinel-trading-lab/agent/src/core/forward-direction-quality.mjs';

const score=(side,p1,p2)=>{
 if(!['CALL','PUT'].includes(side)||!Number.isFinite(p1)||!Number.isFinite(p2))return 'unknown';
 if(p1===p2)return 'tie';
 return (p2>p1?'CALL':'PUT')===side?'win':'loss';
};
const summarise=(records,key)=>{
 const out={win:0,loss:0,tie:0,unknown:0};
 for(const r of records)out[r[key]]++;
 const n=out.win+out.loss;
 return {...out,decisive:n,accuracy:n?+(out.win/n*100).toFixed(1):null};
};
const findBefore=(rows,t)=>{
 for(let j=rows.length-1;j>=0;j--)if(rows[j].ts<=t&&t-rows[j].ts<=1500)return rows[j].price;
 return null;
};
const resultFor=(rows,t,ms=30000)=>{
 const p1=findBefore(rows,t);
 const p2=findBefore(rows,t+ms);
 return [p1,p2];
};
function audit(fixture){
 const input=JSON.parse(readFileSync(new URL('../tests/fixtures/'+fixture,import.meta.url)));
 const quotes=input.quoteHistory.slice().sort((a,b)=>a.ts-b.ts);
 const selector=new CompletedExpiryDirection();
 let previous=null;const entries=[];
 for(let i=0;i<quotes.length;i++){
  const q=quotes[i],ts=q.ts,now=q.receivedAt??ts,history=quotes.slice(0,i+1).filter(x=>x.ts<=ts&&(x.receivedAt??x.ts)<=now);
  const params={quoteHistory:history,quoteAt:ts,price:q.price,now,durationMs:30000};
  const base=analyzeNowOpportunity({...params,engineId:'automatic',qualityPolicy:'adaptive-market-v1'});
  const cycle=thirtySecondCycleForecast({...params,projectionTargetAt:now+30000});
  const final=analyzeNowOpportunity({...params,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
   expiryDirectionSelector:selector,expiryDirectionContext:'exnova|EUR/GBP OTC|30000',candles:[]});
  const state=advanceNowOpportunity({previous,candidate:final,now,quoteAt:ts,asset:'EUR/GBP OTC',
    provider:'exnova',engineId:'automatic',durationMs:30000});
  const issued=state?.phase==='fired'&&previous?.entryTriggeredAt!==state.entryTriggeredAt;
  previous=state;
  if(!issued)continue;
  const [p1,p2]=resultFor(quotes,ts);
  const hist=history,sideAt=(lag)=>{
   const past=findBefore(hist,ts-lag);
   return past==null||past===q.price?null:q.price>past?'CALL':'PUT';
  };
  const analog=causalPatternDirection(params);
  const forecastMove=cycle.ready?cycle.expectedLogMove:null;
  const noise=observedNoise({quotes:hist,now,horizonSeconds:30});
  const row={ts,final:state.side,reason:final.reason,base:base.ready?base.side:null,
   analog:analog.ready?analog.side:null,analogStrength:analog.ready?analog.strength:null,
   cycle:cycle.ready?cycle.side:null,forecastMove,noise,ratio:forecastMove!=null&&noise?Math.abs(forecastMove)/noise:null,
   momentum5:sideAt(5000),momentum15:sideAt(15000),momentum30:sideAt(30000),momentum60:sideAt(60000),
   entry:p1,expiry:p2};
  for(const k of ['final','base','cycle','analog','momentum5','momentum15','momentum30','momentum60'])
   row['result_'+k]=score(row[k],p1,p2);
  row.result_inverted=score(row.final==='CALL'?'PUT':'CALL',p1,p2);
  row.modelsDisagree=!!row.base&&!!row.cycle&&row.base!==row.cycle;
  row.result_agreement=row.modelsDisagree?'unknown':row.result_final;
  entries.push(row);
 }
 const summary={source:input.source,frequency:input.samplingMs??1000,quotes:quotes.length,
  recordedTrades:false,sampleDependent:true,emitted:entries.length,
  results:Object.fromEntries(['final','inverted','base','cycle','analog','momentum5','momentum15','momentum30','momentum60','agreement']
    .map(k=>[k,summarise(entries,'result_'+k)])),
  reasonBreakdown:Object.fromEntries([...new Set(entries.map(x=>x.reason))].map(reason=>[reason,{
   count:entries.filter(x=>x.reason===reason).length,
   results:summarise(entries.filter(x=>x.reason===reason),'result_final')
  }])),
  comparisons:{structureVersusCycleDisagreed:entries.filter(x=>x.modelsDisagree).length,
   conflictFinalWrong:entries.filter(x=>x.modelsDisagree&&x.result_final==='loss').length,
   finalFollowedCycle:entries.filter(x=>x.cycle&&x.final===x.cycle).length,
   finalOpposedCycle:entries.filter(x=>x.cycle&&x.final!==x.cycle).length,
   weakPredictionNoiseRatio:entries.filter(x=>x.ratio!=null&&x.ratio<.15).length,
   unknownFuture:entries.filter(x=>x.result_final==='unknown').length
  },decisions:entries.map(({ts,final,base,cycle,analog,momentum5,ratio,reason,result_final,result_base,result_cycle,result_inverted,modelsDisagree})=>({
    ts,final,base,cycle,analog,momentum5,ratio:ratio!=null?+ratio.toFixed(3):null,
    reason,outcome:result_final,baseOutcome:result_base,cycleOutcome:result_cycle,invertedOutcome:result_inverted,modelsDisagree
  })),
  note:'All accuracy here is from one 9-minute old video, never the new US$15→US$4 losing session. The two samples repeat the same source. No claims about live broker win rate.'
 };
 return summary;
}
const reports=['sentinel-user-video-broker-6dp-20261016.json','sentinel-user-video-20261016.json'].map(audit);
console.log('SENTINEL_13955_DECISION_FAULT_AUDIT='+JSON.stringify(reports));
