/**
 * Research-only diagnosis of regimes observable BEFORE the predicted entry.
 * These are evidence labels, not calibrated chances or a directional signal.
 * No current forming candle state, future prices, votes, or broker orders.
 */
const valid=x=>x!=null&&Number.isFinite(Number(x));
const sign=x=>x>0?'CALL':x<0?'PUT':null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function marketRegimeEvidence({quoteHistory=[],asOf=Date.now()}={}){
 const bucket=new Map();
 for(const q of Array.isArray(quoteHistory)?quoteHistory:[]){
  const t=Number(q?.ts),p=Number(q?.price);
  if(!(p>0)||!valid(t)||t>asOf||t<0)continue;
  bucket.set(Math.floor(t/1000),{ts:t,l:Math.log(p)});
 }
 const rows=[...bucket.values()].sort((a,b)=>a.ts-b.ts),last=rows.at(-1);
 const empty={ready:false,phase:'insufficient-history',trendSide:null,
  reversalSide:null,volatilityShock:false,calibrated:false};
 if(rows.length<95||!last||last.ts-rows[0].ts<94000)return empty;
 const at=secs=>{
  const target=last.ts-secs*1000;
  for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=target)
   return target-rows[i].ts<=2500?rows[i]:null;
  return null;
 };
 const p12=at(12),p35=at(35),p90=at(90);
 if(!p12||!p35||!p90)return empty;
 const recent=rows.filter(r=>r.ts>=last.ts-95000);
 const changes=[];
 for(let i=1;i<recent.length;i++){
  const dt=(recent[i].ts-recent[i-1].ts)/1000;
  if(dt>.2&&dt<2.6)changes.push({d:recent[i].l-recent[i-1].l,dt,t:recent[i].ts});
 }
 if(changes.length<45)return empty;
 const vol=list=>Math.sqrt(list.reduce((a,v)=>a+v.d*v.d,0)/
  Math.max(1,list.reduce((a,v)=>a+v.dt,0)));
 const shortChanges=changes.filter(x=>x.t>=last.ts-20000);
 const longChanges=changes.filter(x=>x.t>=last.ts-90000);
 const sigma=vol(longChanges),sigmaShort=vol(shortChanges);
 if(!(sigma>0))return empty;
 const volRatio=sigmaShort/sigma;
 const shock=volRatio>1.75||volRatio<.49;
 const d12=last.l-p12.l,d35=last.l-p35.l,d90=last.l-p90.l;
 const s12=sign(d12),s35=sign(d35),s90=sign(d90);
 const snr90=Math.abs(d90)/(sigma*Math.sqrt(90));
 const snr35=Math.abs(d35)/(sigma*Math.sqrt(35));
 const alignment=s12&&s12===s35&&s35===s90;
 // A consistent large displacement across separated historical windows.
 // Checking only the latest forming candle would flip direction too often.
 const trendSide=alignment&&snr90>=1.75&&snr35>=1.1&&!shock?s90:null;
 const turn=s12&&s90&&s12!==s90&&snr35<1.7;
 const priceRange=Math.max(...recent.map(x=>x.l))-Math.min(...recent.map(x=>x.l));
 const low=Math.min(...recent.map(x=>x.l)),high=low+priceRange;
 const position=priceRange>0?(last.l-low)/priceRange:.5;
 const rejection=position>=.84&&s12==='PUT'?'PUT':
   position<=.16&&s12==='CALL'?'CALL':null;
 const reversalSide=turn&&rejection===s12?s12:null;
 return {ready:true,
  phase:shock?'volatility-transition':trendSide?'established-trend':
    reversalSide?'confirmed-local-return':snr90<=.9?'range-or-chop':'mixed',
  trendSide,reversalSide,volatilityShock:shock,
  snr90:Number(snr90.toFixed(4)),snr35:Number(snr35.toFixed(4)),
  volatilityRatio:Number(volRatio.toFixed(4)),
  rangePosition:Number(clamp(position,0,1).toFixed(4)),
  sampleSeconds:(last.ts-rows[0].ts)/1000,calibrated:false};
}
export function contextualPairDecision({firstSide,secondSide,trajectorySide,
 pathShare=null,regime={}}={}){
 const first=['CALL','PUT'].includes(firstSide)?firstSide:null;
 const second=['CALL','PUT'].includes(secondSide)?secondSide:null;
 if(!first||!second)return {side:null,reason:'insufficient-two-strategy-evidence'};
 const same=first===second,agreePath=trajectorySide&&pathShare>=.66;
 const trend=regime?.trendSide||null;
 const turn=regime?.reversalSide||null;
 if(regime?.volatilityShock&&same&&trajectorySide!==first)
  return {side:null,reason:'volatility-shock-unconfirmed'};
 if(same){
  if(trend&&first!==trend)return {side:null,reason:'countertrend-agreement-unreliable'};
  if(turn&&first!==turn&&!trend)return {side:null,reason:'local-return-contradicts-pair'};
  if(agreePath&&trajectorySide!==first)
   return {side:null,reason:'historical-trajectory-contradicts-both'};
  return {side:first,reason:'independent-strategy-agreement'};
 }
 if(trend&&(first===trend||second===trend)&&
   (!agreePath||trajectorySide===trend)&&!regime?.volatilityShock)
  return {side:trend,reason:'observed-trend-breaks-strategy-tie'};
 if(agreePath&&pathShare>=.75&&(trajectorySide===first||trajectorySide===second)&&
   !regime?.volatilityShock)
  return {side:trajectorySide,reason:'completed-history-breaks-strategy-tie'};
 return {side:null,reason:'conflict-no-independently-qualified-tiebreak'};
}
