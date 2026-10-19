// Research only: immutable, causal pivot confirmation and minor structure break.
export class VolatilityPivotStructure {
 constructor(){this.reset();}
 reset(context=null){this.context=context;this.last=null;this.bar=null;this.ranges=[];this.previousClose=null;
  this.atr=null;this.minor=[];this.minorCurrent=null;this.lastHigh=null;this.lastLow=null;this.leg=0;this.origin=null;
  this.extreme=null;this.legStartedAt=null;this.pending=null;this.pivots=[];this.emitted=0;this.seen=new Set();}
 observe({context='default',quote,now=quote?.receivedAt??quote?.ts,emit=true}={}){
  const ts=Number(quote?.ts),received=Number(quote?.receivedAt??ts),price=Number(quote?.price);
  if(!(ts>0&&ts<=now&&received>0&&received<=now&&now-ts<=1450&&price>0&&Number.isFinite(price)))return null;
  if(this.context!==context)this.reset(context);
  if(this.last&&ts<=this.last.ts)return null;
  if(this.last&&ts-this.last.ts>3500)this.reset(context);
  const q={ts,price},previous=this.last,second=Math.floor(ts/1000)*1000;
  const closedMinor=this.minorCurrent&&this.minorCurrent.second!==second;
  if(closedMinor){this.minor.push(this.minorCurrent);if(this.minor.length>5)this.minor.shift();}
  this.minorCurrent={...q,second};
  if(closedMinor&&this.minor.length===5){
   const a=this.minor,m=a[2],others=[a[0],a[1],a[3],a[4]];
   if(others.every(x=>x.price<m.price))this.lastHigh={...m,confirmedAt:ts};
   if(others.every(x=>x.price>m.price))this.lastLow={...m,confirmedAt:ts};
  }
  const bucket=Math.floor(ts/5000)*5000;
  if(this.bar&&this.bar.bucket!==bucket){
   const b=this.bar;
   if(b.lastAt-b.firstAt>=2000&&b.firstAt-b.bucket<=2500&&b.bucket+5000-b.lastAt<=3500){
    const tr=Math.max(b.high-b.low,this.previousClose==null?0:Math.abs(b.high-this.previousClose),this.previousClose==null?0:Math.abs(b.low-this.previousClose));
    this.ranges.push(tr);if(this.ranges.length>14)this.ranges.shift();this.previousClose=b.close;
    this.atr=this.ranges.length===14?this.ranges.reduce((s,x)=>s+x,0)/14:null;
   }else{this.ranges=[];this.atr=null;this.previousClose=null;}
   this.bar=null;
  }
  if(!this.bar)this.bar={bucket,firstAt:ts,lastAt:ts,high:price,low:price,close:price};
  else{this.bar.lastAt=ts;this.bar.high=Math.max(this.bar.high,price);this.bar.low=Math.min(this.bar.low,price);this.bar.close=price;}
  this.last=q;if(!(this.atr>price*1e-10))return null;
  const extreme=side=>{const p=side>0?this.lastLow:this.lastHigh;return {...q,threshold:1.5*this.atr,neckline:p&&p.ts>=(this.legStartedAt??this.origin?.ts??ts)?p:null};};
  if(!this.origin){this.origin=q;this.extreme=extreme(0);return null;}
  if(!this.leg){if(Math.abs(price-this.origin.price)>=1.5*this.atr){this.leg=price>this.origin.price?1:-1;this.legStartedAt=this.origin.ts;this.extreme=extreme(this.leg);}return null;}
  if(this.leg*(price-this.extreme.price)>0)this.extreme=extreme(this.leg);
  else if(this.leg*(this.extreme.price-price)>=this.extreme.threshold){
   const pivot={type:this.leg>0?'HIGH':'LOW',at:this.extreme.ts,price:this.extreme.price,confirmedAt:ts,threshold:this.extreme.threshold,neckline:this.extreme.neckline};
   this.pivots.push(pivot);if(this.pivots.length>64)this.pivots.shift();this.pending=pivot;this.leg=-this.leg;this.legStartedAt=pivot.at;this.extreme=extreme(this.leg);
  }
  const p=this.pending;if(!p?.neckline||p.neckline.ts>=p.at||p.neckline.confirmedAt>p.at)return null;
  const sign=p.type==='LOW'?1:-1,side=sign>0?'CALL':'PUT';
  if(sign*(price-p.price)<=0){this.pending=null;return null;}
  if(sign*(price-p.neckline.price)<=0||previous&&sign*(price-previous.price)<0)return null;
  if(!emit)return null;
  const id=[context,p.type,p.at,p.confirmedAt].join('|');if(this.seen.has(id))return null;
  this.seen.add(id);if(this.seen.size>128)this.seen.delete(this.seen.values().next().value);this.pending=null;this.emitted++;
  return {id,ready:true,side,observedAt:ts,decisionAt:Number(now),entryPrice:price,reason:'volatility-pivot-and-observed-structure-break',pivot:{...p},atr:this.atr,knownAt:Number(now),quoteAt:ts};
 }
}
