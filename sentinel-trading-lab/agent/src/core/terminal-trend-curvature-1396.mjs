// Predictive curvature from CLOSED 10-second price displacements.
// No candle-colour veto, permission gate, expiry reassignment, clock wait,
// or change to persistent trends that do not show 3-bar deceleration.
// Returns an ADDITIVE future log-price move, not a claimed win probability.
export function terminalTrendCurvature({bars=[],persistentTrend=false,regime='unknown',priorSign=0,
 sigma=0,horizonSeconds=0}={}){
 const h=Number(horizonSeconds),v=Number(sigma),s=Number(priorSign);
 if(!persistentTrend||regime!=='trend'||![-1,1].includes(s)||
  !(v>0&&h>0&&bars.length>=3))return 0;
 const [a,b,c]=bars.slice(-3).map(x=>s*Number(x));
 if(![a,b,c].every(x=>Number.isFinite(x)&&x>0))return 0;
 // Evidence must be distributed across THREE independent completed bars,
 // never inferred from one forming candle or distance traveled alone.
 if(!(b<a*.82&&c<b*.82))return 0;
 const acceleration=(a-c)/200; // (10s log-return difference)/20s/10s
 const adverse=-s*.225*acceleration*h*h;
 const cap=v*Math.sqrt(h)*1.25;
 return -s*Math.min(Math.abs(adverse),cap);
}
