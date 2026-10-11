import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const T=1800000000000;
const rows=Array.from({length:180},(_,i)=>({ts:T+i*1000,
  price:1.08+Math.sin(i*.08)*.00008+i*.0000002}));
function subject(){
 const rt=new DemoTradingRuntime({enableVNext:true});
 const now=rows.at(-1).ts;
 return {rt,now,snap:{
  quoteHistory:rows,quoteTs:now,price:rows.at(-1).price,provider:'iq_option',
  instrument:'blitz',feedValidated:true
 }};
}
test('VNext paired strategies shadow-research is disabled by default',()=>{
 const {rt,now,snap}=subject();
 assert.equal(rt.settings.pairResearchEnabled,false);
 const out=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(out.allowed,false);
 assert.equal(out.analysis.vnext.combinedResearch,null);
});
test('enable pair experimental without broker order, preserve independent holding and entry time',()=>{
 const {rt,now,snap}=subject();
 rt.patchSettings({pairResearchEnabled:true,pairResearchId:'reversal',
  entryTimeMode:'fixed',entryLeadSeconds:30,holdingSeconds:60});
 const out=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(out.allowed,false);
 const pair=out.analysis.vnext.combinedResearch;
 assert.equal(pair.mode,'fixed');
 assert.equal(pair.pairId,'reversal');
 assert.equal(pair.actionable,false);
 assert.equal(pair.calibrated,false);
 assert.equal(pair.alternatives.length,1);
 assert.equal(pair.alternatives[0].entryAt,now+30_000);
 assert.equal(pair.alternatives[0].exitAt,now+90_000);
 assert.equal(out.analysis.side,'WAIT');
 const out2=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.strictEqual(out2.analysis.vnext.combinedResearch,pair);
});
test('patch settings invalidates pair cache and selection mode without activating REAL orders',()=>{
 const {rt,now,snap}=subject();
 rt.patchSettings({pairResearchEnabled:true,pairResearchId:'retest',entryTimeMode:'automatic',
  holdingSeconds:45});
 const first=rt._signalValidationGate({analysis:{side:'WAIT'},snap,settings:rt.settings,now});
 assert.equal(first.analysis.vnext.combinedResearch.mode,'automatic');
 assert.ok(first.analysis.vnext.combinedResearch.alternatives.length>1);
 rt.patchSettings({pairResearchId:'levels_breakout'});
 assert.equal(rt.vnextPairResearchCache,null);
 assert.equal(rt.settings.demoAutopilot,false);
});
