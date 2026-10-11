import test from 'node:test';
import assert from 'node:assert/strict';
import {oscillatoryPhaseForecast}
 from '../sentinel-trading-lab/agent/src/core/vnext-oscillation-phase-research.mjs';
const start=1800000000000;
const oscillator=(len,period,phase=0)=>Array.from({length:len},(_,i)=>({
 ts:start+i*1000,
 price:1.1*Math.exp(.0012*Math.sin(2*Math.PI*i/period+phase)
 +.00000016*i+.000011*Math.sin(i*.67))
}));
const base=now=>({
 engineId:'automatic',asset:'EUR/USD OTC',delaySeconds:30,holdingSeconds:30,
 issuedAt:now,entryAt:now+30000,exitAt:now+60000,side:'PUT',
 projectedEntryPrice:1.1000,projectedExitPrice:1.09997
});
test('phase is fitted strictly from already-seen quotes; original 67 is immutable',()=>{
 const q=oscillator(1800,106,.2),now=q.at(-1).ts,plan=base(now);
 const original=structuredClone(plan);
 const first=oscillatoryPhaseForecast({basePlan:plan,quoteHistory:q,now});
 assert.deepEqual(plan,original);
 assert.equal(first.baselineSide,'PUT');
 assert.equal(first.originalUntouched,true);
 assert.equal(first.researchOnly,true);
 assert.equal(first.actionable,false);
 assert.equal(first.calibrated,false);
 const poisoned=[...q,{ts:now+1000,price:100},{ts:now+60000,price:.01}];
 assert.deepEqual(oscillatoryPhaseForecast({basePlan:plan,quoteHistory:poisoned,now}),first);
});
test('stable cycle makes measurable historical holdout gain and a non-zero direct paired forecast',()=>{
 const q=oscillator(1900,94,.75),now=q.at(-1).ts,plan=base(now);
 const r=oscillatoryPhaseForecast({basePlan:plan,quoteHistory:q,now});
 assert.ok(r.weight>0,'no validated oscillation: '+JSON.stringify(r));
 assert.ok(r.pastHoldoutGain>0);
 assert.ok(r.periodSeconds>0);
 assert.ok(Number.isFinite(r.rawPhaseLogReturn));
 assert.ok(Math.abs(r.rawPhaseLogReturn)>1e-6);
});
test('neutral no-data fallback is never presented as a calibrated live signal',()=>{
 const now=start+10000;
 const p=base(now);
 const r=oscillatoryPhaseForecast({basePlan:p,quoteHistory:oscillator(11,50),now});
 assert.equal(r.weight,0);
 assert.equal(r.phaseSide,p.side);
 assert.equal(r.reason,'insufficient-tick-evidence');
 assert.equal(r.actionable,false);
});
test('phase identification uses the selected delay and holding period, not a disguised fixed 30s interval',()=>{
 const qs=oscillator(1900,132,1);
 const now=qs.at(-1).ts;
 const returns=[];
 for(const h of [5,10,15,30,45,60,120,180,300,600]){
  const p={...base(now),delaySeconds:h,holdingSeconds:h,
   entryAt:now+h*1000,exitAt:now+2*h*1000};
  const r=oscillatoryPhaseForecast({basePlan:p,quoteHistory:qs,now});
  assert.equal(r.baselineSide,'PUT');
  assert.equal(r.researchOnly,true);
  if(r.weight>0)returns.push(r.rawPhaseLogReturn);
 }
 assert.ok(returns.length>0);
 assert.ok(new Set(returns.map(x=>x.toFixed(10))).size>1);
});
