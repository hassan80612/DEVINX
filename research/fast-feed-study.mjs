// Offline engineering diagnostics. Generated paths do not establish market accuracy.
import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
import {compactObservedQuoteHistory} from '../sentinel-trading-lab/agent/src/core/observed-quote-history.mjs';
import {CompletedOutcomeSelector} from './completed-outcome-selector.mjs';
import {wideBandCycleForecast} from './wide-band-expiry-direction.mjs';
const T=Date.UTC(2026,9,16,22),length=540;
const seeds=[1013,1019,1021],phases=[0,7,17];
function value(kind,t,seed){
 const phase=(seed%17)/17*2*Math.PI,noise=.000025*Math.sin(t*2.73+phase)+.000015*Math.sin(t*1.13+seed);
 const trend=.000009*t;
 if(kind==='slow-trend')return Math.exp(trend+.00008*Math.sin(t/17+phase)+noise);
 if(kind==='fast-trend')return Math.exp(trend+.00035*Math.sin(t*2*Math.PI/11+phase)+noise);
 if(kind==='fast-range')return Math.exp(.00065*Math.sin(t*2*Math.PI/(17+seed%5)+phase)+noise);
 if(kind==='changing-range')return Math.exp(.0006*Math.sin(2*Math.PI*(t/43+t*t/60000)+phase)+noise);
 if(kind==='sharp-reversals')return Math.exp(.000024*(45-Math.abs(t%180-90))+.00025*Math.sin(t*2*Math.PI/13+phase)+noise);
 if(kind==='mixed-volatility')return Math.exp(.0003*Math.sin(t*2*Math.PI/73+phase)+
  (t<270?.00008:.0009)*Math.sin(t*2*Math.PI/23+phase)+noise);
 throw Error(kind);
}
const count=()=>({wins:0,losses:0,ties:0,waiting:0,maxLossStreak:0,consecutiveLosses:0,spans:[],reasons:{},timings:[]});
function study(kind,hz){
 const report={published_13928:count(),time_retention:count(),completed_selector:count(),wide_band:count(),wide_selector:count()};
 for(const seed of seeds){
  let old=[],next=[];const selector=new CompletedOutcomeSelector(),bandSelector=new CompletedOutcomeSelector(),streaks={};
  for(let i=0;i<=length*hz;i++){
   const t=i/hz,q={ts:T+t*1000,price:value(kind,t,seed)};old.push(q);next.push(q);
   if(old.length>7200)old.splice(0,old.length-6800);
   if(next.length>6000)next=compactObservedQuoteHistory(next);
   if(i%hz!==0)continue;
   const retained=next.length>2400?compactObservedQuoteHistory(next):next;
   const selectionBegin=performance.now();
   const base=analyzeNowOpportunity({quoteHistory:retained,quoteAt:q.ts,price:q.price,now:q.ts,
    durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
   const selected=selector.observe({rows:retained,now:q.ts,price:q.price,base});
   const selectionMs=performance.now()-selectionBegin;
   const bandBegin=performance.now(),wide=base.ready?wideBandCycleForecast({quoteHistory:retained,quoteAt:q.ts,now:q.ts,price:q.price,durationMs:30000}):null;
   const wideChoice=wide?.ready?{...base,...wide}:base;
   const bandChoice=bandSelector.observe({rows:retained,now:q.ts,price:q.price,base,alternative:wideChoice});
   const bandMs=selectionMs+performance.now()-bandBegin;
   if(t<180||t>length-30||!phases.some(p=>(t-180-p)%30===0))continue;
   const phase=phases.find(p=>(t-180-p)%30===0);
   for(const [name,rows] of [['published_13928',old.slice(-2400)],['time_retention',retained],['completed_selector',retained],['wide_band',retained],['wide_selector',retained]]){
    const r=report[name],begin=performance.now();let decision=name==='completed_selector'?selected:name==='wide_selector'?bandChoice:name==='wide_band'?wideChoice:analyzeNowOpportunity({quoteHistory:rows,quoteAt:q.ts,
     price:q.price,now:q.ts,durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17'});
    r.timings.push(name==='completed_selector'?selectionMs:['wide_band','wide_selector'].includes(name)?bandMs:performance.now()-begin);r.spans.push((rows.at(-1).ts-rows[0].ts)/1000);
    r.reasons[decision.reason]=(r.reasons[decision.reason]||0)+1;
    const outcome=!decision.ready?'waiting':value(kind,t+30,seed)===q.price?'ties':
     (value(kind,t+30,seed)>q.price?'CALL':'PUT')===decision.side?'wins':'losses';
    r[outcome]++;const key=name+'|'+phase;
    streaks[key]=outcome==='losses'?(streaks[key]||0)+1:0;
    r.maxLossStreak=Math.max(r.maxLossStreak,streaks[key]);
   }
  }
 }
 for(const r of Object.values(report)){
  r.rate=r.wins+r.losses?100*r.wins/(r.wins+r.losses):null;
  r.timings.sort((a,b)=>a-b);r.decisionMs={p50:r.timings[Math.floor(r.timings.length*.5)],p95:r.timings[Math.floor(r.timings.length*.95)],max:r.timings.at(-1)};
  r.historySpanSeconds={min:Math.min(...r.spans),max:Math.max(...r.spans)};
  delete r.spans;delete r.timings;delete r.consecutiveLosses;
 }
 return report;
}
const result={scope:'Generated engineering diagnostics, not a market accuracy estimate. No regime aggregation.',
 baseline:'Production a83ac46f40e448595070dc21511d3f9739708dc8 / 13.9.28',
 protocol:'Same analytic price path at 2Hz and 40Hz; matched decision times at three 30s phases after 180s. Each decision uses only observations already received. No outcome used in model selection.',
 seeds,phases,results:{}};
for(const kind of ['slow-trend','fast-trend','fast-range','changing-range','sharp-reversals','mixed-volatility']){
 result.results[kind]={};for(const hz of [2,40])result.results[kind][hz]=study(kind,hz);
}
writeFileSync(process.argv[2]||'reports/sentinel-fast-feed-diagnostics-20261016.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.results).map(([kind,rates])=>[kind,
 Object.fromEntries(Object.entries(rates).map(([hz,models])=>[hz,Object.fromEntries(Object.entries(models).map(([name,r])=>[name,
 {wins:r.wins,losses:r.losses,waiting:r.waiting,rate:r.rate,maxLossStreak:r.maxLossStreak,historySpanSeconds:r.historySpanSeconds,decisionMs:r.decisionMs}]))]))])),null,2));
