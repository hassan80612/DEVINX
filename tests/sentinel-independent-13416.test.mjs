import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {entryOpportunities} from '../sentinel-trading-lab/agent/src/core/entry-opportunities.mjs';

const t=Date.UTC(2026,9,8,12);
const up=[{ts:t-2400,price:100.08},{ts:t-600,price:100.012},{ts:t-450,price:100},
 {ts:t-300,price:100.014},{ts:t-150,price:100.021},{ts:t,price:100.023}];
function analysis(){
 return{metrics:{
  micro:{delta5:-.02,delta15:-.03,delta2:.005,expected5:.06,expected30:.12},
  shortModel:{ready:true,sr:{support:100,resistance:105},range:.1,
    callScore:80,putScore:20,reversalCallScore:70,reversalPutScore:0,
    callRoomOk:true,putRoomOk:false}},
 entryPlanner:{horizons:{}}};
}
function snap(quotes=up){return{provider:'iq_option',asset:'TEST',price:quotes.at(-1).price,
 quoteTs:quotes.at(-1).ts,quoteHistory:quotes}}
function runtime(){
 const r=new DemoTradingRuntime();
 r.settings.asset='TEST';r.settings.forecastHorizonSeconds=120;r.settings.orderDurationMs=30000;
 r.settings.futureDisplayThreshold=70;r.settings.risk.minConfidence=55;return r;
}
test('subanalyst enters independently with no approved future main scenario',()=>{
 const r=runtime(),a=analysis(),o=r._operationalSignalState(a,snap(),t);
 assert.equal(o.scenario,null);
 assert.equal(o.entryAnalyst.signal.side,'CALL');
 assert.equal(o.entryAnalyst.signal.actionable,true,o.reason);
 assert.equal(o.entryAnalyst.signal.durationMs,30000);
 assert.equal(o.entryAnalyst.independent,true);
 assert.equal(o.actionable,true);
});
test('subanalyst may act after a separate opposite scenario is invalidated',()=>{
 const r=runtime(),a=analysis();
 r.scenarioSetup={context:['iq_option','TEST',120,30000,r._strategyComboKey()].join('|'),
   id:'old-put-scenario',side:'PUT',createdAt:t-3000,deadline:t+30000,
   invalidation:100.005,status:'INVALIDADO',closed:true,reason:'Old scenario invalidated'};
 const o=r._operationalSignalState(a,snap(),t);
 assert.equal(o.scenario.side,'PUT');
 assert.equal(o.scenario.closed,true);
 assert.equal(o.entryAnalyst.signal.side,'CALL');
 assert.equal(o.entryAnalyst.signal.actionable,true,o.reason);
 assert.equal(o.actionable,true);
});
test('subanalyst never manufactures PUT from an unconfirmed retracement',()=>{
 const r=runtime(),a=analysis(),candidate=entryOpportunities({analysis:a,snap:snap(),now:t,minPoints:70,durationMs:30000});
 assert.equal(candidate[1].allowed,false);
 const o=r._operationalSignalState(a,snap(),t);
 assert.equal(o.entryAnalyst.signal.side,'CALL');
 assert.equal(o.entryAnalyst.candidates[1].allowed,false);
});
test('invalid or stale independent quotes cannot pass the execution gate',()=>{
 const r=runtime(),o=r._operationalSignalState(analysis(),snap(),t+5000);
 assert.equal(o.entryAnalyst.signal.actionable,false);
 assert.equal(o.actionable,false);
});
test('overlay has standalone subanalyst with explicit own entry gate, not planner',async()=>{
 const source=await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('data-sentinel-card="independent-subanalyst"'));
 assert.ok(source.includes('SUBANALISTA INDEPENDENTE'));
 assert.ok(source.includes("ownSignal.actionable===true"));
 assert.ok(source.includes("ownAnalyst.qualification?.allowed===true"));
 assert.ok(source.includes("ownSignal.activeUntil)>decisionNow"));
 assert.ok(source.includes("ownContextOk&&liveNow&&analysisFresh"));
 const independentGate=source.slice(source.indexOf('const ownNow='),source.indexOf('const ownSide='));
 assert.ok(!independentGate.includes('futureDecision'),independentGate);
 assert.ok(!independentGate.includes('plannerReadable'),independentGate);
 assert.ok(!independentGate.includes('runtimeView.canEnter'),independentGate);
});
