// The market BASE decides the sign. Strategies only explain the current
// setup and the user can separately select a manual specialist. Never wait
// for a completed next candle, veto an entry, or spawn parallel engines.
const isNum=x=>Number.isFinite(Number(x))&&Number(x)>0;
function earlier(rows,at){
 for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)
  return at-rows[i].ts<=2500?rows[i].price:null;
 return null;
}
export function automaticChartContext({quoteHistory=[],quoteAt=null,price=null,base=null}={}){
 const ts=Number(quoteAt),spot=Number(price);
 if(!(ts>0&&isNum(spot)))return {strategy:'smart_confluence',marketShape:'unknown'};
 const rows=(Array.isArray(quoteHistory)?quoteHistory:[]).filter(x=>x?.ts<=ts&&
   Number(x?.receivedAt??x?.ts)<=ts&&x?.ts>=ts-60000&&isNum(x?.price))
  .map(x=>({ts:Number(x.ts),price:Number(x.price)})).sort((a,b)=>a.ts-b.ts);
 if(rows.length<10)return {strategy:'smart_confluence',marketShape:'insufficient'};
 if(base?.regime==='observed-range-turn'||/rejection|level/i.test(base?.reason||''))
  return {strategy:'support_resistance',marketShape:'level-turn'};
 const rangeRows=rows.filter(x=>x.ts>=ts-46000&&x.ts<ts-4000);
 if(rangeRows.length<5)return {strategy:'smart_confluence',marketShape:'short-history'};
 const highs=rangeRows.map(x=>x.price),hi=Math.max(...highs),lo=Math.min(...highs);
 const span=hi-lo;if(!(span>0))return {strategy:'smart_confluence',marketShape:'flat'};
 const first=rangeRows[0].price,last=rangeRows.at(-1).price;
 const net=Math.abs(last-first);
 let path=0;
 for(let i=1;i<rangeRows.length;i++)path+=Math.abs(rangeRows[i].price-rangeRows[i-1].price);
 const efficiency=path>0?net/path:0;
 const direction=Math.sign(last-first),position=(spot-lo)/span;
 // A coherent recent leg can move through a previously sideways market.
 // Only historical five-second buckets qualify; no future-looking ticks.
 const legBuckets=new Map();
 for(const q of rows){
  if(q.ts>ts-25000&&q.ts<=ts-1000)legBuckets.set(Math.floor(q.ts/5000),q.price);
 }
 const leg=[...legBuckets.entries()].slice(-5);
 if(leg.length===5&&leg.every((p,i)=>i===0||p[0]===leg[i-1][0]+1)){
  const deltas=leg.slice(1).map((p,i)=>p[1]-leg[i][1]);
  const distance=leg.at(-1)[1]-leg[0][1];
  const aligned=deltas.filter(v=>v*distance>0).length;
  const legPath=deltas.reduce((sum,v)=>sum+Math.abs(v),0);
  const coherent=aligned>=3&&legPath>0&&Math.abs(distance)/legPath>=.65&&Math.abs(distance)>=span*.18;
  if(coherent){
   const legSide=distance>0?'CALL':'PUT';
   const nearCeiling=distance>0&&position>=.80&&position<=1.03;
   const nearFloor=distance<0&&position<=.20&&position>=-.03;
   // Near a boundary is information, not an automatic late entry.
   if(nearCeiling||nearFloor)return {strategy:'support_resistance',marketShape:nearCeiling?'directional-rise-at-ceiling':'directional-fall-at-floor',legSide,lateEntryRisk:true,efficiency};
   return {strategy:'trend',marketShape:distance>0?'directional-leg-up':'directional-leg-down',legSide,efficiency};
  }
 }
 // Price came back 38%-62% into an established observed swing.
 if(efficiency>=.45&&direction!==0&&((direction>0&&position>=.38&&position<=.62)||
   (direction<0&&position>=.38&&position<=.62)))
  return {strategy:'fibonacci_retest',marketShape:'swing-pullback',efficiency};
 if(position>=.90||position<=.10)
  return {strategy:'support_resistance',marketShape:'historical-extreme',efficiency};
 if(efficiency>=.43)return {strategy:'trend',marketShape:'directional-trend',efficiency};
 return {strategy:'smart_confluence',marketShape:'mixed-range',efficiency};
}
