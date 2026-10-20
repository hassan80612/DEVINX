import {observedExpiryQuote} from './observed-expiry-quote-20261018.mjs';
import {thirtySecondCycleForecast} from './thirty-second-expiry-direction.mjs';
// Compare forecasts by observed expiry outcomes. Never release an admission,
// wait for training, or modify the side already held by the signal lifecycle.
export class CompletedExpiryDirection{
 constructor(){this.reset(null);}
 reset(context){this.context=context;this.pending=[];this.loss={base:.5,wide:.5};
  this.completed=0;this.lastIssued=-Infinity;this.lastIssuedDueAt=-Infinity;this.lastQuoteAt=-Infinity;this.cache=null;}
 observe({context,quoteHistory,quoteAt,price,now,baseline,projectionTargetAt=null}){
  if(this.context!==context)this.reset(context);
  const ts=Number(quoteAt),spot=Number(price);
  if(!(Number.isFinite(ts)&&ts>0&&ts<=now&&now-ts<=1450&&Number.isFinite(spot)&&spot>0)||ts<this.lastQuoteAt)return baseline;
  if(ts>this.lastQuoteAt){
   const pending=[];
   for(const p of this.pending){
    if(ts<p.dueAt){pending.push(p);continue;}
    const point=observedExpiryQuote({quoteHistory,currentQuote:{ts,price:spot,receivedAt:now},dueAt:p.dueAt,now});
    if(!point||point.price===p.price)continue;
    const side=point.price>p.price?'CALL':'PUT';
    for(const name of ['base','wide'])this.loss[name]=.8*this.loss[name]+.2*(p[name]===side?0:1);
    this.completed++;
   }
   this.pending=pending;this.lastQuoteAt=ts;
  }
  if(!baseline.ready)return baseline;
  const deadline=projectionTargetAt==null?Number(now)+30000:Number(projectionTargetAt);
  const key=[ts,spot,deadline,quoteHistory.length,quoteHistory[0]?.ts,baseline.side].join('|');
  let wide;
  if(this.cache?.key===key)wide=this.cache.forecast;
  else{
   wide=thirtySecondCycleForecast({quoteHistory,quoteAt:ts,price:spot,now,durationMs:30000,
    projectionTargetAt:deadline,periodSearch:'wide'});
   this.cache={key,forecast:wide};
  }
  const alternative=wide?.ready?wide:baseline;
  // One completed 30s outcome must represent ONE independent training
  // interval. Five-second starts overlap the same price leg six times.
  if(ts>=this.lastIssuedDueAt&&deadline>ts){
   this.lastIssued=ts;this.lastIssuedDueAt=deadline;
   this.pending.push({at:ts,dueAt:deadline,
    price:spot,base:baseline.side,wide:alternative.side});
  }
  // Before enough completed outcomes exist, use strong penalized-fit evidence
  // instead of automatically favoring the narrower period search. Both
  // fits must describe the SAME received observations and expiry horizon.
  // A cycle at the available search/coverage boundary is not identified
  // well enough for this bootstrap; retain the existing decision instead.
  const cycleCovered=Number.isFinite(wide?.fittedPeriodSeconds)&&
   wide.fittedPeriodSeconds<Math.min(180,wide.observedPoints-1);
  const bootstrap=this.completed<5&&wide?.ready&&cycleCovered&&
   baseline.observedPoints===wide.observedPoints&&baseline.horizonMs===wide.horizonMs&&
   Number.isFinite(baseline.fitSelectionCriterion)&&Number.isFinite(wide.fitSelectionCriterion)&&
   wide.fitSelectionCriterion+10<baseline.fitSelectionCriterion;
  const selected=this.completed>=5&&this.loss.wide+.1<this.loss.base&&wide?.ready;
  return bootstrap||selected?{...baseline,...wide,reason:bootstrap?
   'bootstrap-expiry-penalized-fit':'completed-expiry-outcomes-adaptive-cycle'}:baseline;
 }
}
