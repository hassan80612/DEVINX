import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {countertrendPivotRisk,verifiedFirstQuoteTurnAtLevel} from
 '../sentinel-trading-lab/agent/src/core/shared-pivot-guard.mjs';
import {reviewH207UnifiedAdmission} from
 '../sentinel-trading-lab/agent/src/core/runtime.mjs';

const AT=1800000000000;
const quotes=Array.from({length:121},(_,i)=>{
 const ts=AT-120000+i*1000;
 return {ts,price:1.1+i*.000018,receivedAt:ts};
});
const peak=quotes.at(-4).price;
quotes[118].price=peak-.00002;
quotes[119].price=peak-.000045;
quotes[120].price=peak-.000075;
const spot=quotes.at(-1).price;
const tol=.00012;
const level={level:peak,low:peak-.00003,high:peak+.00003,
 confirmedPivots:1,independentRejections:1,
 directionalPivots:1,directionalRejections:1,
 independentTests:3,oldestTestAge:24};
const turn={extreme:peak,extremeAt:AT-3000,firstBreak:quotes.at(-3).price,
 retest:quotes.at(-2).price,observedAt:AT};
const proof={kind:'confirmed-level-structure-reversal',side:'PUT',confirmedAt:AT,
 level,earlyLevelProof:{tolerance:tol,verifiedAt:AT},microTurn:turn};
const options={quoteHistory:quotes,quoteAt:AT,now:AT,price:spot,side:'PUT',durationMs:60000};

test('235: proven resistance allows first two-tick counterturn on a still-uptrending candle',()=>{
 const baseline=countertrendPivotRisk({...options,reversalEvidence:null});
 assert.equal(baseline,true,'baseline trend-only guard blocks the early countertrend');
 assert.equal(verifiedFirstQuoteTurnAtLevel({...options,reversalEvidence:proof}),true);
 assert.equal(countertrendPivotRisk({...options,reversalEvidence:proof}),false);
 const candidate={ready:true,side:'PUT',observedAt:AT,entryPrice:spot,
  reason:'confirmed-level-structure-reversal',priceStructure:{confirmedReversal:proof},
  earlyTurnEvidence:{kind:'level-microstructure-first-turn'}};
 assert.equal(reviewH207UnifiedAdmission({...options,candidate,
  durationMs:60000,allowVerifiedEarlyReversal:true}).ready,true,
  'existing 1m final admission continues to require the current microturn');
});

test('235: mirrored support CALL is allowed against a still-falling candle with same proof',()=>{
 const mirror=x=>2.2-x;
 const mirrored=quotes.map(q=>({...q,price:mirror(q.price)}));
 const mirroredProof={...proof,side:'CALL',
  level:{...level,level:mirror(level.level),low:mirror(level.high),high:mirror(level.low)},
  microTurn:{...turn,extreme:mirror(turn.extreme),
   firstBreak:mirror(turn.firstBreak),retest:mirror(turn.retest)}};
 const ctx={...options,side:'CALL',price:mirror(spot),quoteHistory:mirrored};
 assert.equal(countertrendPivotRisk({...ctx,reversalEvidence:null}),true);
 assert.equal(verifiedFirstQuoteTurnAtLevel({...ctx,reversalEvidence:mirroredProof}),true);
 assert.equal(countertrendPivotRisk({...ctx,reversalEvidence:mirroredProof}),false);
});

test('235: no reversal from a label, unsupported level, old quote, or only one opposite tick',()=>{
 const check=(e,x={})=>verifiedFirstQuoteTurnAtLevel({...options,...x,reversalEvidence:e});
 assert.equal(check({...proof,earlyLevelProof:null}),false);
 assert.equal(check({...proof,level:{...level,directionalRejections:0}}),false);
 assert.equal(check({...proof,level:{...level,independentTests:1}}),false);
 assert.equal(check({...proof,level:{...level,oldestTestAge:1}}),false);
 assert.equal(check({...proof,microTurn:{...turn,extremeAt:AT-18000}}),false);
 assert.equal(check(proof,{now:AT+2000}),false);
 assert.equal(check(proof,{durationMs:30000}),false);
 assert.equal(check(proof,{durationMs:300000}),false);
 const wrongQuotes=quotes.map(x=>({...x}));
 wrongQuotes[119].price=wrongQuotes[118].price;
 assert.equal(check(proof,{quoteHistory:wrongQuotes}),false);
 const future=quotes.map(x=>({...x}));
 future.push({ts:AT+1000,price:spot-.0003,receivedAt:AT+1000});
 assert.equal(check(proof,{quoteHistory:future}),true,
  'future quotes are ignored rather than used to make a current reversal');
});

test('235: no 30s/5m entry-rule changes, no native expiry rewrite',()=>{
 const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
 const keeper=readFileSync(new URL('worker/broker-native-expiry-keeper.mjs',root),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
 const early=readFileSync(new URL('src/core/early-reversal-transition.mjs',root),'utf8');
 const impulse=readFileSync(new URL('src/core/impulse-lifecycle-227.mjs',root),'utf8');
 assert.match(early,/earlyLevelProof:\{tolerance:tol,verifiedAt:at\}/);
 assert.match(impulse,/earlyLevelProof:\{tolerance:tol,verifiedAt:at\}/);
 assert.match(early,/level:\{level:proof.level,\.\.\.proof.levelEvidence\}/);
 assert.match(impulse,/level:\{level:proof.level,\.\.\.proof.levelEvidence\}/);
});
