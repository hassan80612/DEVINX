import test from 'node:test';
import assert from 'node:assert/strict';
import {ContextCompletedConflictChoice} from '../experiments/context-completed-conflict-choice-20261017.mjs';
import {analyzeNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const T=1792250040000;
const rows=Array.from({length:421},(_,i)=>({ts:T+i*1000,receivedAt:T+i*1000,
 price:1.1+.00035*Math.sin(i/19)+.000025*Math.sin(i/3)}));
function observation(selector,history,i,context='iq_option|EUR/USD|30000'){
 const q=rows[i];
 return analyzeNowOpportunity({quoteHistory:history,quoteAt:q.ts,price:q.price,now:q.ts,
  durationMs:30000,engineId:'automatic',qualityPolicy:'adaptive-market-v17',
  expiryDirectionSelector:selector,expiryDirectionContext:context});
}
test('unseen future quotes do not change candidate decisions or matured outcome evidence',()=>{
 const a=new ContextCompletedConflictChoice(),b=new ContextCompletedConflictChoice();
 for(let i=180;i<=300;i++){
  const past=rows.slice(0,i+1),unseen=rows.slice(i+1).map(q=>({...q,price:q.price*1.3}));
  const x=observation(a,past,i),y=observation(b,[...past,...unseen],i);
  assert.deepEqual(y,x,`quote ${i}`);
  assert.deepEqual(b.lastConflictEvidence,a.lastConflictEvidence);
  assert.deepEqual(b.conflictHistory,a.conflictHistory);
 }
});
test('changing the provider/asset context behaves like a new candidate, without retaining learned disagreements',()=>{
 const used=new ContextCompletedConflictChoice();
 for(let i=180;i<=360;i++)observation(used,rows.slice(0,i+1),i);
 const fresh=new ContextCompletedConflictChoice(),context='exnova|GBP/USD|30000';
 const x=observation(used,rows.slice(0,362),361,context);
 const y=observation(fresh,rows.slice(0,362),361,context);
 assert.deepEqual(x,y);
 assert.deepEqual(used.conflictHistory,fresh.conflictHistory);
 assert.deepEqual(used.conflictPending,fresh.conflictPending);
});
