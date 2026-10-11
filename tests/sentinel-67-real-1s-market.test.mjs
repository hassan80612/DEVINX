import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {singleEngineForecast} from '../sentinel-trading-lab/agent/src/core/vnext-single-engine.mjs';
import {branchingFutureForecast67} from '../sentinel-trading-lab/agent/src/core/offline-branching-future-path-67.mjs';
const H=[30,60,180];
const FIXED_POLICY={
  30:{model:'branches',minBps:.5,minDirShare:.5,maxDistance:1.3,minStrength:0,agree:'any'},
  60:{model:'baseline',minBps:0,minDirShare:0,maxDistance:99,minStrength:.2,agree:'same'},
  180:{model:'branches',minBps:1,minDirShare:.5,maxDistance:99,minStrength:0,agree:'same'},
};
const side=(a,b)=>a<b?'CALL':a>b?'PUT':'DRAW';
function parseCsv(file){
 const lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/),quotes=[];
 let prev=0;
 for(const line of lines){
  const fields=line.split(',');
  if(fields.length<6)continue;
  let t=Number(fields[0]),p=Number(fields[4]);
  if(t>1e15)t=Math.floor(t/1000);
  if(!Number.isFinite(t)||!Number.isFinite(p)||!(p>0)||t<=prev)continue;
  quotes.push({ts:t,price:p});prev=t;
 }
 return quotes;
}
const empty=()=>({n:0,emitted:0,correct:0,err:0,reversal:0,reversalCalls:0,reversalHits:0});
const wilson=(wins,n)=>{if(!n)return null;const p=wins/n,z=1.96,den=1+z*z/n,
 a=(p+z*z/(2*n))/den,b=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return [Number((100*(a-b)).toFixed(2)),Number((100*(a+b)).toFixed(2))]};
const pct=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
function describe(v){
 return {opportunities:v.n,signals:v.emitted,coveragePct:pct(v.emitted,v.n),
  accuracyPct:pct(v.correct,v.emitted),ci95Pct:wilson(v.correct,v.emitted),
  meanAbsPriceErrorBps:v.emitted?Number((v.err/v.emitted).toFixed(5)):null,
  realizedReversals:v.reversal,reversalSignals:v.reversalCalls,
  accuracyOnReversalsPct:pct(v.reversalHits,v.reversalCalls)};
}
function eligible(base,branch,price,h){
 const r=branch?.branching,f=FIXED_POLICY[h];
 if(!base||!r)return false;
 const selected=f.model==='baseline'?base:branch;
 if(!selected||!['CALL','PUT'].includes(selected.side))return false;
 const share=r.historicalDirectionShare?.[selected.side]??0;
 const size=Math.abs(Math.log(selected.projectedPrice/price))*10000;
 const z=size/Math.max(.1,r.neighborReturnDispersionBps||99);
 if(share<f.minDirShare||size<f.minBps||z<f.minStrength)return false;
 if((r.averageNeighborDistance??99)>f.maxDistance)return false;
 if(f.agree==='same'&&base.side!==branch.side)return false;
 return true;
}
test('real market holdout: Binance 1s close, unmodified Sentinel 67 vs precommitted paths and abstentions',()=>{
 const dir=process.env.SENTINEL_RESEARCH_MARKET_DIR||'tmp/sentinel-market-1s';
 const files=fs.readdirSync(dir).filter(f=>f.endsWith('.csv')).sort();
 assert.equal(files.length,4,'four independent symbol-day files required (BTC/ETH × 2 days)');
 const rows=Object.fromEntries(H.map(h=>[h,{baseline:empty(),unfiltered:empty(),selected:empty()}]));
 const perSource={};
 for(const name of files){
  const data=parseCsv(path.join(dir,name)),report=Object.fromEntries(H.map(h=>[h,{baseline:empty(),selected:empty()}]));
  assert.ok(data.length>=80000,name+': 1s data must span most of day');
  for(let i=3000;i<data.length-185;i+=600){
   const history=data.slice(i-2399,i+1),now=data[i].ts;
   const current=data[i].price,prior=data[i-20].price;
   const snap={quoteHistory:history,quoteTs:now,price:current,provider:'binance_1s_holdout'};
   for(const h of H){
    // Binance official 1s candles should have a row for every second.
    const future=data[i+h]&&data[i+h].ts>=now+h*1000&&
      data[i+h].ts<=now+h*1000+1000?data[i+h]:null;
    if(!future)continue;
    const actualSide=side(current,future.price);
    const turning=side(prior,current)!==actualSide;
    const m=singleEngineForecast({settings:{engine:'automatic',asset:name,orderDurationMs:h*1000},
      snap,now,provider:'binance_1s_holdout'});
    const original=m?.receipt||null;
    const branch=branchingFutureForecast67({quoteHistory:history,asOf:now,selectedSeconds:h,
      baseline:{receipt:original},mode:'standalone'});
    for(const [which,p,emit] of [
     ['baseline',original,!!original],['unfiltered',branch,!!original&&['CALL','PUT'].includes(branch.side)],
     ['selected',FIXED_POLICY[h].model==='baseline'?original:branch,
      eligible(original,branch,current,h)]
    ]){
     const v=rows[h][which],vv=report[h][which]||null;
     for(const bucket of [v,vv].filter(Boolean)){
      bucket.n++;if(turning)bucket.reversal++;
      if(!emit||!p||!['CALL','PUT'].includes(p.side))continue;
      bucket.emitted++;if(turning)bucket.reversalCalls++;
      if(p.side===actualSide){bucket.correct++;if(turning)bucket.reversalHits++}
      bucket.err+=Math.abs(Math.log(p.projectedPrice/future.price))*10000;
     }
    }
   }
  }
  perSource[name]={bars:data.length,
   byHorizon:Object.fromEntries(H.map(h=>[h,Object.fromEntries(Object.entries(report[h]).map(([k,v])=>[k,describe(v)]))]))};
 }
 const outcome=Object.fromEntries(H.map(h=>[h,Object.fromEntries(Object.entries(rows[h]).map(([k,v])=>[k,describe(v)]))]));
 console.log('SENTINEL_REAL_ONE_SECOND_MARKET='+JSON.stringify({
  source:'Binance official public BTCUSDT/ETHUSDT 1s Kline CLOSE, not OTC, not trade executions',
  temporalProtocol:'issue only on first-hour-warmed 1s closes, strictly earlier 2400s used, outcome at selected expiry',
  horizonSeconds:H,precommittedPolicy:FIXED_POLICY,
  results:outcome,bySource:perSource,
  noTradingOrders:true,brokerOTCAccuracyUnverified:true
 }));
 assert.ok(H.every(h=>rows[h].baseline.n>200),'needs substantial number of independent real records');
});
