import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalFuturePath,conditionalPathWindow} from '../sentinel-trading-lab/agent/src/core/forward-path-research.mjs';
import {RESEARCH_PAIRS,pairedEntryResearch,reconcileEntryPreview} from '../sentinel-trading-lab/agent/src/core/paired-entry-research.mjs';

const BASE=1800000000000;
function history({count=2300,shift=0,after=0}={}){
 let p=1.1,prev=0;
 const out=[];
 for(let i=0;i<count+after;i++){
  const normal=Math.sin(i*.049+shift)*.000015+Math.sin(i*.013+shift)*.000023;
  const drift=Math.sin(i*.003+shift)*.0000015;
  const jump=(i%397===0&&i>0?-.00005:0);
  const delta=normal+drift+jump+prev*.15;
  p*=Math.exp(delta);prev=delta;
  out.push({ts:BASE+i*1000,price:p});
 }
 return out;
}
test('future path uses only ticks at/before the forecast; a future tick cannot alter it',()=>{
 const original=history(),now=original.at(-1).ts;
 const clean=historicalFuturePath({quoteHistory:original,asOf:now,horizonSeconds:120});
 const polluted=historicalFuturePath({quoteHistory:[...original,
  {ts:now+1000,price:77},{ts:now+150000,price:.001}],asOf:now,horizonSeconds:120});
 assert.equal(clean.ready,true);
 assert.deepEqual(clean.expectedPath,polluted.expectedPath);
 assert.deepEqual(clean.extremeTimes,polluted.extremeTimes);
 assert.equal(clean.actionable,false);
 assert.equal(clean.calibrated,false);
 assert.ok(clean.independentNeighbors>=8);
});
test('historical extrema are windows and never hard-coded timestamps or certainties',()=>{
 const q=history(),at=q.at(-1).ts;
 const r=historicalFuturePath({quoteHistory:q,asOf:at,horizonSeconds:90});
 assert.equal(r.ready,true);
 for(const key of ['peak','trough']){
  const e=r.extremeTimes[key];
  assert.ok(e.estimateSeconds>=0&&e.estimateSeconds<=90);
  assert.ok(e.windowSeconds[0]<=e.estimateSeconds);
  assert.ok(e.windowSeconds[1]>=e.estimateSeconds);
 }
 const w=conditionalPathWindow(r,30,60);
 assert.equal(w.holdingSeconds,60);
 assert.equal(w.entrySeconds,30);
 assert.equal(w.actionable,false);
});
test('no full historical trajectories means no invented endpoint evidence',()=>{
 const q=history({count:100});
 const r=historicalFuturePath({quoteHistory:q,asOf:q.at(-1).ts,horizonSeconds:300});
 assert.equal(r.ready,false);
 assert.equal(conditionalPathWindow(r,30,60).side,null);
});
test('presets retain independently versioned, distinct motor ownership',()=>{
 assert.equal(RESEARCH_PAIRS.length,3);
 assert.deepEqual(RESEARCH_PAIRS.map(x=>x.id),['reversal','levels_breakout','retest']);
 for(const p of RESEARCH_PAIRS)assert.notEqual(p.first.engine,p.second.engine);
 assert.equal(RESEARCH_PAIRS[0].first.version,70);
 assert.equal(RESEARCH_PAIRS[0].second.version,67);
});
test('fixed entry and expiration are separate, with preserved outcome reference',()=>{
 const q=history(),now=q.at(-1).ts;
 const r=pairedEntryResearch({settings:{engine:'automatic',asset:'EUR/USD OTC'},
  snap:{quoteHistory:q,quoteTs:now,provider:'iq_option'},now,
  mode:'fixed',pairId:'reversal',leadSeconds:30,holdingSeconds:60});
 assert.equal(r.mode,'fixed');
 assert.equal(r.alternatives.length,1);
 assert.equal(r.alternatives[0].leadSeconds,30);
 assert.equal(r.alternatives[0].holdingSeconds,60);
 assert.equal(r.alternatives[0].entryAt,now+30000);
 assert.equal(r.alternatives[0].exitAt,now+90000);
 assert.equal(r.actionable,false);
 assert.equal(r.calibrated,false);
 assert.ok(['research-candidate','no-qualified-forecast'].includes(r.status));
});
test('automatic mode compares multiple lead times while holding stays constant',()=>{
 const q=history(),now=q.at(-1).ts;
 const r=pairedEntryResearch({settings:{asset:'EUR/USD OTC'},
  snap:{quoteHistory:q,quoteTs:now,provider:'iq_option'},now,
  mode:'automatic',pairId:'levels_breakout',holdingSeconds:45,
  autoDelays:[5,10,30,60]});
 assert.equal(r.alternatives.length,4);
 assert.deepEqual(r.alternatives.map(x=>x.leadSeconds),[5,10,30,60]);
 assert.ok(r.alternatives.every(x=>x.holdingSeconds===45));
 assert.ok(r.selected===null||[5,10,30,60].includes(r.selected.leadSeconds));
 assert.equal(r.actionable,false);
});
test('automatic disagreement archives rather than silently overwrites original forecast',()=>{
 const previous={pairId:'reversal',side:'CALL',leadSeconds:30,holdingSeconds:60,
  entryAt:BASE+30000,issuedAt:BASE};
 const r=reconcileEntryPreview({previous,research:{mode:'automatic',pairId:'reversal',
  selected:{...previous,side:'PUT',entryAt:BASE+32000}},now:BASE+2000});
 assert.equal(r.event,'REVISED_WITH_ARCHIVE');
 assert.equal(r.archived.side,'CALL');
 assert.equal(r.current.side,'PUT');
 assert.equal(previous.side,'CALL');
 const cancel=reconcileEntryPreview({previous,research:{mode:'automatic',
  pairId:'reversal',selected:null},now:BASE+2000});
 assert.equal(cancel.event,'CANCELLED_WITH_ARCHIVE');
 assert.equal(cancel.current,null);
});
test('fixed mode never moves clock, even when direction is invalidated',()=>{
 const prev={pairId:'reversal',side:'CALL',entryAt:BASE+30000,holdingSeconds:60};
 const r=reconcileEntryPreview({previous:prev,research:{mode:'fixed',pairId:'reversal',
  selected:{side:'PUT',entryAt:BASE+11000}},now:BASE+5000});
 assert.equal(r.current.entryAt,BASE+30000);
 assert.equal(r.current.invalidated,true);
 assert.equal(r.event,'FIXED_WARNING_DIRECTION_INVALIDATED');
});
