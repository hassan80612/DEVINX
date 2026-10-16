import {thirtySecondCycleForecast} from './thirty-second-expiry-direction.mjs';
// Compare forecasts by observed expiry outcomes. Never release an admission,
// wait for training, or modify the side already held by the signal lifecycle.
export class CompletedExpiryDirection{
 constructor(){this.reset(null);}
 reset(context){this.context=context;this.pending=[];this.loss={base:.5,wide:.5};
  this.completed=0;this.lastIssued=-Infinity;this.lastQuoteAt=-Infinity;this.cache=null;}
 observe({context,quoteHistory,quoteAt,price,now,baseline,projectionTargetAt=null}){
  if(this.context!==context)this.reset(context);
  const ts=Number(quoteAt),spot=Number(price);
  if(!(Number.isFinite(ts)&&ts>0&&ts<=now&&now-ts<=1450&&Number.isFinite(spot)&&spot>0)||ts<this.lastQuoteAt)return baseline;
  if(ts>this.lastQuoteAt){
   const pending=[];
   for(const p of this.pending){
    if(ts<p.dueAt){pending.push(p);continue;}
    if(ts>p.dueAt+1000||spot===p.price)continue;
    const side=spot>p.price?'CALL':'PUT';
    for(const name of ['base','wide'])this.loss[name]=.8*this.loss[name]+.2*(p[name]===side?0:1);
    this.completed++;
   }
   this.pending=pending;this.lastQuoteAt=ts;
  }
  if(!baseline.ready)return baseline;
  const key=[ts,spot,projectionTargetAt,quoteHistory.length,quoteHistory[0]?.ts,baseline.side].join('|');
  let wide;
  if(this.cache?.key===key)wide=this.cache.forecast;
  else{
   wide=thirtySecondCycleForecast({quoteHistory,quoteAt:ts,price:spot,now,durationMs:30000,
    projectionTargetAt,periodSearch:'wide'});
   this.cache={key,forecast:wide};
  }
  const alternative=wide?.ready?wide:baseline;
  if(ts-this.lastIssued>=5000){
   this.lastIssued=ts;this.pending.push({at:ts,dueAt:projectionTargetAt==null?ts+30000:Number(projectionTargetAt),
    price:spot,base:baseline.side,wide:alternative.side});
  }
  const selected=this.completed>=5&&this.loss.wide+.1<this.loss.base&&wide?.ready;
  return selected?{...baseline,...wide,reason:'completed-expiry-outcomes-adaptive-cycle'}:baseline;
 }
}
