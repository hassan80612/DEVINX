import test from 'node:test';
import assert from 'node:assert/strict';
import {entryOffsets,planEntryWindow} from '../sentinel-trading-lab/agent/src/core/entry-window-planner.mjs';
import {evolveOpportunity} from '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const T=1800000000000,settings={asset:'EUR/USD',engine:'automatic',forecastMode:'continuous',orderDurationMs:5000};
const candidate=entryAt=>({engineId:'automatic',asset:'EUR/USD',side:'CALL',
  issuedAt:T,entryAt,exitAt:entryAt+5000,delaySeconds:5,holdingSeconds:5,
  projectedEntryPrice:1.2,projectedExitPrice:1.2005,selectionStrength:1});
test('5s/10s/30s planner NEVER suggests a signal at an unconfirmable exact cycle boundary',()=>{
 for(const h of [5,10,15,30,45,60,120]){
  const chosen=entryOffsets(h);
  assert.ok(chosen.every(s=>s<h),JSON.stringify({h,chosen}));
  assert.ok(chosen.length>0);
  const plan=planEntryWindow({windowSeconds:h,holdingSeconds:h,now:T,
   evaluateLead:seconds=>({side:'CALL',projectedEntryPrice:1.2,projectedExitPrice:1.201,
     selectionStrength:seconds===h?100:1})});
  assert.ok(plan.entryAt>T&&plan.entryAt<T+h*1000,JSON.stringify(plan));
 }
});
test('an entry at exact window deadline no longer creates a window that can never fire',()=>{
 const p=evolveOpportunity({candidate:candidate(T+5000),settings,now:T,quoteAt:T});
 assert.equal(p.phase,'scanning');
 const accepted=evolveOpportunity({candidate:candidate(T+4000),settings,now:T,quoteAt:T});
 assert.equal(accepted.phase,'open');
 assert.equal(accepted.entryAt,T+4000);
 const confirmed=evolveOpportunity({previous:accepted,settings,now:T+4000,quoteAt:T+4000,
   confirmation:{side:'CALL',projectedEntryPrice:1.2,projectedExitPrice:1.2005}});
 assert.equal(confirmed.phase,'fired');
 assert.equal(confirmed.side,'CALL');
});
test('once the original clock deadline is reached, fresh next-cycle forecast alone can open a new window',()=>{
 const old=evolveOpportunity({candidate:candidate(T+4000),settings,now:T,quoteAt:T});
 const result=evolveOpportunity({previous:old,settings,now:T+5000,quoteAt:T+5000,
   candidate:{...candidate(T+7000),issuedAt:T+5000}});
 assert.equal(result.phase,'open');
 assert.equal(result.windowStartedAt,T+5000);
 assert.equal(result.windowEndsAt,T+10000);
});
