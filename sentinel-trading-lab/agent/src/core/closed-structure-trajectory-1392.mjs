// Forecast the whole entry-to-expiry log-price trajectory from CLOSED 10s
// structure. No CALL/PUT veto, countdown, fixed delay or broker action here.
// The output is a single conditional price curve, sampled at the actual
// planned entry and the selected broker expiry.
const clip=(x,min,max)=>Math.max(min,Math.min(max,x));
const integrate=(seconds,tau)=>tau*(1-Math.exp(-seconds/tau));
const mean=xs=>xs.reduce((a,b)=>a+b,0)/Math.max(1,xs.length);
export function closedStructureTrajectory(profile,seconds){
 const p=profile, h=Math.max(0,Number(seconds)||0);
 if(!p?.bars?.length||!p?.points?.length||!(p.sigma>0)||h===0)return 0;
 const bars=p.bars, close=p.points.at(-1);
 const longVelocity=mean(bars.slice(0,6))/10;
 const recentVelocity=mean(bars.slice(-3))/10;
 // Most-recent COMPLETED 10s bars provide the transient velocity, not the
 // unfinished current candle. Its price only anchors today's forecast.
 const terminalVelocity=(bars.at(-1)*.5+bars.at(-2)*.3+
   bars.at(-3)*.2)/10;
 const closedMean=mean(p.points),high=Math.max(...p.points),
   low=Math.min(...p.points),center=(high+low)/2;
 // A ranging market has no permanent positive/negative drift.
 // Instead the observed price location and recent completed movement
 // determine a mean-reverting transient response at each future horizon.
 if(p.regime==='range'){
   const target=closedMean*.55+center*.45;
   const equilibrium=(target-close)*.68*(1-Math.exp(-h/32));
   const impulse=terminalVelocity*integrate(h,9);
   const cap=p.sigma*Math.sqrt(Math.max(1,h))*2.4;
   return clip(equilibrium+impulse,-cap,cap);
 }
 // A persistent trend has its own measured non-zero long-horizon velocity.
 // A structurally confirmed reversal instead follows the recent completed
 // velocity. Other conditions blend the two without an all-or-nothing gate.
 let steady=p.reversal?
   recentVelocity*.78+longVelocity*.05:
   p.persistentTrend?
   longVelocity*.42+recentVelocity*.58:
   longVelocity*.26+recentVelocity*.33;
 const magnitudeLast=mean(bars.slice(-3).map(Math.abs));
 const magnitudePrior=mean(bars.slice(3,6).map(Math.abs));
 const fading=clip((magnitudePrior-magnitudeLast)/
   Math.max(magnitudePrior,1e-12),0,1);
 // Taper/rejection MODIFIES a price forecast continuously. Four candles
 // alone never block a direction or create a reverse signal.
 const mature=clip(Number(p.streakStage?.lateRisk)||0,0,1);
 const fade=p.persistentTrend?(1-.24*fading-.24*mature):
   (1-.35*fading);
 steady*=Math.max(.25,fade);
 const horizon=h/(1+h/260);
 // Current completed-bar impulse decays towards the structurally
 // estimated longer velocity. This can bend the curve between entry and
 // expiry; a single constant velocity cannot.
 const transition=(terminalVelocity-steady)*integrate(h,
   p.reversal?24:p.persistentTrend?20:16);
 const drift=steady*horizon+transition;
 const softCenterPull=(closedMean-close)*(p.reversal?.035:.07)*
   (1-Math.exp(-h/42));
 const cap=p.sigma*Math.sqrt(Math.max(1,h))*2.4;
 return clip(drift+softCenterPull,-cap,cap);
}
