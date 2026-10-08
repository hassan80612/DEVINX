import test from 'node:test';
import assert from 'node:assert/strict';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';

const t=Date.UTC(2026,9,8,12);
const up=[{ts:t-2400,price:100.08},{ts:t-600,price:100.012},{ts:t-450,price:100},
  {ts:t-300,price:100.014},{ts:t-150,price:100.021},{ts:t,price:100.023}];
const down=up.map(x=>({...x,price:205-x.price}));
function analysis(side='CALL'){
 const call=side==='CALL';
 return {metrics:{
   micro:{delta5:call?-.02:.02,delta15:call?-.03:.03,delta2:call?.005:-.005,expected5:.06,expected30:.12},
   shortModel:{ready:true,sr:{support:100,resistance:105},range:.1,
     callScore:call?64:20,putScore:call?20:64,
     reversalCallScore:call?58:0,reversalPutScore:call?0:58,
     callRoomOk:call,putRoomOk:!call}
 },entryPlanner:{horizons:{}}};
}
function snap(quotes=up){return {provider:'iq_option',asset:'TEST',price:quotes.at(-1).price,
 quoteTs:quotes.at(-1).ts,quoteHistory:quotes};}
function runtime({percent=70,points=55}={}){
 const r=new DemoTradingRuntime();r.settings.asset='TEST';r.settings.forecastHorizonSeconds=120;
 r.settings.orderDurationMs=30000;r.settings.futureDisplayThreshold=percent;r.settings.risk.minConfidence=points;return r;
}
test('support maps before touch and two post-touch quotes qualify early CALL even with negative 5s momentum',()=>{
 const a=analysis(),pre=entryOpportunities({analysis:a,snap:snap(up.slice(0,2)),now:t-600,minPoints:55});
 assert.equal(pre[0].level,100);assert.equal(pre[0].structuralReaction,false);assert.equal(pre[0].allowed,false);
 const [call,put]=entryOpportunities({analysis:a,snap:snap(),now:t,minPoints:55,durationMs:30000});
 assert.equal(call.allowed,true);assert.equal(call.structuralReaction,true);assert.equal(call.plan.reaction.preMapped,true);
 assert.equal(call.plan.reaction.touchAt,t-450);assert.equal(put.allowed,false);
});
test('resistance maps before touch and confirms symmetric PUT before the 5s momentum turns',()=>{
 const [call,put]=entryOpportunities({analysis:analysis('PUT'),snap:snap(down),now:t,minPoints:55,durationMs:30000});
 assert.equal(put.allowed,true);assert.equal(put.structuralReaction,true);assert.equal(put.plan.reaction.mappedLevel,105);
 assert.equal(call.allowed,false);
});
test('no trigger for a single touch, stale feed or price outside a mapped zone',()=>{
 const a=analysis();
 const one=entryOpportunities({analysis:a,snap:snap(up.slice(0,3)),now:t-450,minPoints:55})[0];
 assert.equal(one.allowed,false);assert.equal(one.structuralReaction,false);
 const stale=entryOpportunities({analysis:a,snap:snap(),now:t+3000,minPoints:55})[0];
 assert.equal(stale.allowed,false);assert.equal(stale.blockedBy,'feed');
 const far=up.map((q,i)=>({...q,price:100.4+i*.001}));
 const missed=entryOpportunities({analysis:a,snap:snap(far),now:t,minPoints:55})[0];
 assert.equal(missed.structuralReaction,false);
});
test('high technical threshold rejects otherwise confirmed structural points',()=>{
 const call=entryOpportunities({analysis:analysis(),snap:snap(),now:t,minPoints:90})[0];
 assert.equal(call.allowed,false);assert.equal(call.blockedBy,'score');
});
test('the independent subanalyst can release CALL with no qualified main forecast',()=>{
 const a=analysis(),r=runtime(),op=r._operationalSignalState(a,snap(),t);
 assert.equal(op.scenario,null);assert.equal(op.side,'CALL');assert.equal(op.actionable,true,op.reason);
 assert.equal(op.entryAnalyst.candidates[0].structuralReaction,true);
 const view=scenarioViewFromRuntime({operational:op,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t});
 assert.equal(view.canEnter,true);
 const reused=r._operationalSignalState(a,snap(up.map(x=>({...x,ts:x.ts+600,price:x.price}))),t+600);
 assert.equal(r.entryResearch.pending.length,1);
 assert.equal(reused.scenario,null);
});
test('the visible percentage gates independent entries, even if the technical point filter is lower',()=>{
 const a=analysis(),r=runtime({percent:90,points:55});
 const op=r._operationalSignalState(a,snap(),t);
 assert.equal(op.actionable,false);assert.equal(op.entryAnalyst.qualification.requiredScore,90);
 assert.equal(op.entryAnalyst.qualification.percentFilter,90);
 assert.match(op.reason,/90%/);
 const lower=runtime({percent:50,points:55})._operationalSignalState(a,snap(),t);
 assert.equal(lower.actionable,true);
});
test('stale independent quotes never release an operational signal',()=>{
 const r=runtime(),op=r._operationalSignalState(analysis(),snap(),t+5000);
 assert.equal(op.actionable,false);
 assert.equal(op.entryAnalyst.candidates[0].blockedBy,'feed');
});

test('a tiny two-tick bounce around support is noise, not a CALL reversal',()=>{
 const jitter=[
  {ts:t-1200,price:100.002},{ts:t-800,price:100.001},
  {ts:t-600,price:100},{ts:t-300,price:100.001},
  {ts:t-150,price:100.002},{ts:t,price:100.0025}
 ];
 const o=entryOpportunities({analysis:analysis(),snap:snap(jitter),now:t,minPoints:55})[0];
 assert.equal(o.structuralReaction,false);
 assert.equal(o.allowed,false);
});
test('a rebound that retouches the same extreme is rejected rather than called a reversal',()=>{
 const choppy=[up[0],up[1],up[2],up[3],{ts:t-220,price:100.003},up[4],up[5]];
 const o=entryOpportunities({analysis:analysis(),snap:snap(choppy),now:t,minPoints:55})[0];
 assert.equal(o.structuralReaction,false);
 assert.equal(o.allowed,false);
});
test('repeated quotes at one timestamp cannot impersonate independent confirmations',()=>{
 const faked=[up[0],up[1],up[2],
  {ts:t-300,price:100.014},{ts:t-300,price:100.02},
  {ts:t-300,price:100.023}];
 const o=entryOpportunities({analysis:analysis(),snap:snap(faked),now:t-300,minPoints:55})[0];
 assert.equal(o.structuralReaction,false);
 assert.equal(o.allowed,false);
});
test('a return toward the level after a valid rebound withdraws the signal',()=>{
 const faded=[up[0],up[1],up[2],up[3],up[4],{ts:t,price:100.014}];
 const o=entryOpportunities({analysis:analysis(),snap:snap(faded),now:t,minPoints:55})[0];
 assert.equal(o.structuralReaction,false);
 assert.equal(o.allowed,false);
});
test('confirmation delayed beyond the first-reaction window is not pursued',()=>{
 const late=[{ts:t-4600,price:100.08},{ts:t-3000,price:100.012},{ts:t-2500,price:100},
 {ts:t-1600,price:100.014},{ts:t-150,price:100.021},{ts:t,price:100.023}];
 const o=entryOpportunities({analysis:analysis(),snap:snap(late),now:t,minPoints:55})[0];
 assert.equal(o.structuralReaction,false);
 assert.equal(o.allowed,false);
});

test('structural entry releases on its second confirmed reaction quote, without waiting for a third',()=>{
 const confirmedAt=t-150,confirmedQuotes=up.slice(0,5);
 const op=runtime()._operationalSignalState(analysis(),snap(confirmedQuotes),confirmedAt);
 assert.equal(op.entryAnalyst.candidates[0].structuralReaction,true);
 assert.equal(op.entryAnalyst.candidates[0].allowed,true);
 assert.equal(op.actionable,true,JSON.stringify({state:op.state,reason:op.reason,confirmation:op.confirmation}));
 assert.equal(op.entryAt,confirmedAt);
});
test('a reaction not evaluated in its first timing window cannot be released late',()=>{
 const confirmedQuotes=up.slice(0,5),now=t+1800;
 const op=runtime()._operationalSignalState(analysis(),snap(confirmedQuotes),now);
 assert.equal(op.actionable,false);
});

test('PUT is released at the second resistance-rejection quote, with no extra wait',()=>{
 const confirmedAt=t-150;
 const op=runtime()._operationalSignalState(analysis('PUT'),snap(down.slice(0,5)),confirmedAt);
 assert.equal(op.entryAnalyst.candidates[1].structuralReaction,true);
 assert.equal(op.side,'PUT');
 assert.equal(op.actionable,true,JSON.stringify({state:op.state,reason:op.reason,confirmation:op.confirmation}));
 assert.equal(op.entryAt,confirmedAt);
});
