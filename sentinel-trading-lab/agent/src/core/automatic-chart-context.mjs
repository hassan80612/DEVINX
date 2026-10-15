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
 // Price came back 38%-62% into an established observed swing.
 if(efficiency>=.45&&direction!==0&&((direction>0&&position>=.38&&position<=.62)||
   (direction<0&&position>=.38&&position<=.62)))
  return {strategy:'fibonacci_retest',marketShape:'swing-pullback',efficiency};
 if(position>=.90||position<=.10)
  return {strategy:'support_resistance',marketShape:'historical-extreme',efficiency};
 if(efficiency>=.43)return {strategy:'trend',marketShape:'directional-trend',efficiency};
 return {strategy:'smart_confluence',marketShape:'mixed-range',efficiency};
}
