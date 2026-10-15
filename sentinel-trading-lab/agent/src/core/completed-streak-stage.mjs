// Stage of a completed chart-candle streak. Only completed, consecutive
// real broker bars count; a streak alone is NEVER a reversal or a veto.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function completedStreakStage({candles=[],quotePrice=null,asOf=Date.now(),sigma=0}={}){
 const neutral={side:null,count:0,extended:false,lateRisk:0,reason:'no-completed-streak'};
 const now=Number(asOf),p=Number(quotePrice),v=Number(sigma);
 if(!(p>0&&v>0))return neutral;
 const bars=(Array.isArray(candles)?candles:[]).map(c=>({
  from:Number(c.from)*1000,to:Number(c.to)*1000,
  open:Number(c.open),close:Number(c.close),
  high:Number(c.high??c.max),low:Number(c.low??c.min)
 })).filter(c=>c.to<=now&&c.from<c.to&&c.open>0&&c.close>0&&
  c.low>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close))
 .sort((a,b)=>a.to-b.to||a.from-b.from).slice(-8);
 if(bars.length<4)return neutral;
 const last=bars.at(-1),period=last.to-last.from;
 if(!(period>=5000&&period<=300000&&now-last.to<=period*1.5))return neutral;
 const four=bars.slice(-4),sgn=Math.sign(Math.log(last.close/last.open));
 if(!sgn||four.some((c,i)=>Math.sign(Math.log(c.close/c.open))!==sgn||
  Math.abs((c.to-c.from)-period)>1000||(i&&c.from-four[i-1].to>1000)))
  return neutral;
 const side=sgn>0?'CALL':'PUT';
 const net=sgn*Math.log(last.close/four[0].open);
 const normalized=net/Math.max(1e-12,v*Math.sqrt(period*4/1000));
 const extended=normalized>=1.6;
 if(!extended)return {side,count:4,extended:false,lateRisk:0,reason:'ordinary-streak'};
 const bodies=four.map(c=>Math.abs(Math.log(c.close/c.open)));
 const first3=(bodies[0]+bodies[1]+bodies[2])/3;
 const taper=clamp((first3*.8-bodies[3])/Math.max(first3*.8,1e-12));
 const wick=sgn>0?Math.log(last.high/last.close):Math.log(last.close/last.low);
 const wickRatio=wick/Math.max(bodies[3],v*Math.sqrt(period/1000)*.2);
 const rejection=clamp((wickRatio-.5)/1.6);
 const retreat=sgn*Math.log(last.close/p);
 const retreatStrength=clamp(retreat/Math.max(v*Math.sqrt(period/1000)*.7,1e-12));
 const extension=clamp((normalized-1.6)/2);
 // Strong uninterrupted trends retain nearly full directional strength.
 // Only a mature streak AND observed taper, rejection or price retreat
 // progressively reduce preference for late chasing.
 const lateRisk=Number((extension*(.10+.32*taper+.25*rejection+.50*retreatStrength)).toFixed(4));
 return {side,count:4,extended:true,lateRisk:clamp(lateRisk),
  normalizedExtension:Number(normalized.toFixed(3)),
  taper:Number(taper.toFixed(3)),
  rejection:Number(rejection.toFixed(3)),
  retreat:Number(retreatStrength.toFixed(3)),
  reason:lateRisk>.28?'mature-streak-with-rejection':'persistent-streak'};
}
