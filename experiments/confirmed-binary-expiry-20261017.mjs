// RESEARCH ONLY. Combine the existing expiry projection, binary historical
// outcomes and persistent price structure, with unchanged release lifecycle.
import {CompletedExpiryDirection} from '../sentinel-trading-lab/agent/src/core/completed-expiry-direction.mjs';
import {binaryPatternDirection} from './binary-pattern-direction-20261017.mjs';
function priceAt(rows,at){for(let i=rows.length-1;i>=0;i--)if(rows[i].ts<=at)return at-rows[i].ts<=2500?rows[i].price:null;return null;}
export class ConfirmedBinaryExpiry extends CompletedExpiryDirection{
 reset(context){super.reset(context);this.binaryCounts={opposed:0,overrides:0};this.lastBinary=null;}
 observe(args){
  const projection=super.observe(args);
  if(!projection.ready)return projection;
  const binary=binaryPatternDirection({...args,durationMs:30000});
  this.lastBinary={at:args.quoteAt,base:projection.side,binary:binary.side,strength:binary.strength,overridden:false};
  if(!binary.ready||!(binary.strength>=.4)||binary.side===projection.side)return projection;
  this.binaryCounts.opposed++;
  const rows=args.quoteHistory.filter(q=>q.ts<=args.quoteAt&&(q.receivedAt??q.ts)<=args.now&&q.ts>=args.quoteAt-24000&&q.price>0).sort((a,b)=>a.ts-b.ts);
  const sign=binary.side==='CALL'?1:-1,now=Number(args.price);
  const anchors=[20,15,10,5].map(h=>priceAt(rows,args.quoteAt-h*1000));
  if(anchors.some(p=>!(p>0)))return projection;
  if(![anchors[0],anchors[2],anchors[3]].every(p=>sign*Math.log(now/p)>0))return projection;
  const path=[...anchors,now],gross=path.slice(1).reduce((s,p,i)=>s+Math.abs(Math.log(p/path[i])),0);
  const net=Math.abs(Math.log(now/path[0]));
  if(!(gross>0&&net/gross>=.25))return projection;
  this.binaryCounts.overrides++;this.lastBinary.overridden=true;
  return {...binary,ready:true,side:binary.side,reason:'research-confirmed-binary-expiry',
   binaryEvidence:{strength:binary.strength,flowEfficiency:net/gross,previousSide:projection.side}};
 }
}
