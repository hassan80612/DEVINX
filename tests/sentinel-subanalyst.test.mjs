import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {EntryResearch} from '../sentinel-trading-lab/agent/src/core/entry-research.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {LatestQuoteScheduler} from '../sentinel-trading-lab/agent/worker/latest-quote-scheduler.mjs';
const t=Date.UTC(2026,9,8,12),pause=ms=>new Promise(r=>setTimeout(r,ms));
function runtime(){const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:120,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;return r;}
function plan(side,horizon,kind='continuation'){const call=side==='CALL';return{asset:'TEST',horizonSeconds:horizon,rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,strategyFutureBias:side,strategyFuture:{confidence:80,activeCount:1,evidence:80},callTrigger:100,putTrigger:100,callInvalidation:90,putInvalidation:110,expectedMove:.1,entryTiming:{maxDistance:.05},scenario:{kind,continuationReady:kind==='continuation',reversalConfirmed:kind==='reversal'}};}
function analysis(main='PUT',entry='CALL',kind='reversal'){const call=entry==='CALL';return{quality:{entrySide:call?'BUY':'SELL'},generalConsensus:{rapid:{side:entry},strategies:{side:entry,strength:80}},metrics:{micro:{delta5:call?.01:-.01,delta15:call?.01:-.01},shortModel:{ready:true,callScore:call?80:10,putScore:call?10:80,reversalCallScore:call&&kind==='reversal'?80:0,reversalPutScore:!call&&kind==='reversal'?80:0,reversalCallCandidate:call&&kind==='reversal',reversalPutCandidate:!call&&kind==='reversal',callSetup:call&&kind==='continuation',putSetup:!call&&kind==='continuation',flowReadyCall:call,structureReadyCall:call,callRoomOk:call,flowReadyPut:!call,structureReadyPut:!call,putRoomOk:!call,reversalCallConfirmed:call&&kind==='reversal',reversalPutConfirmed:!call&&kind==='reversal'}},entryPlanner:{horizons:{'120':plan(main,120),'30':plan(entry,30,kind)}}};}
const snap=(prices,now=t,provider='iq_option')=>({provider,asset:'TEST',price:prices.at(-1),quoteTs:now,quoteHistory:prices.map((price,i)=>({price,ts:now-(prices.length-i-1)*200}))});
test('PUT scenario survives a confirmed CALL entry at 30s with distinct headline and expiry',()=>{
 const r=runtime(),a=analysis(),o=r._operationalSignalState(a,snap([99.99,100.01,100.02]),t);
 assert.equal(o.actionable,true);assert.equal(o.side,'CALL');assert.equal(o.scenario.side,'PUT');assert.equal(o.entryDecisionHorizonSeconds,30);assert.equal(r.entryResearch.pending.length,1);
 const v=scenarioViewFromRuntime({operational:o,asset:'TEST',horizonSeconds:120,durationMs:30000,forecast:a.entryPlanner.horizons['30'],now:t,minPoints:55});assert.equal(v.canEnter,true);assert.equal(v.displaySide,'PUT');assert.equal(v.entrySide,'CALL');
 const flip=analysis('CALL','CALL');const next=r._operationalSignalState(flip,snap([100.02,100.02],t+500),t+500);assert.equal(next.scenario.side,'PUT');assert.equal(next.scenario.deadline,t+120000);assert.equal(r.entryResearch.pending.length,1);
 const ended=r._operationalSignalState(a,snap([100.02,100.02],t+4000),t+4000);assert.equal(ended.state,'OPORTUNIDADE CONSUMIDA');assert.equal(ended.actionable,false);assert.equal(ended.scenarioDeadline,t+120000);assert.equal(ended.scenario.closed,false);
 const late=r._operationalSignalState(analysis('PUT','PUT'),snap([99.99,99.98],t+10000),t+10000);assert.equal(late.actionable,false);assert.equal(r.entryResearch.pending.length,1);
 const closed=scenarioViewFromRuntime({operational:ended,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t+4000});assert.equal(closed.deadline,t+120000);assert.equal(closed.closed,false);assert.equal(closed.entryState,'OPORTUNIDADE CONSUMIDA');assert.equal(closed.canEnter,false);
});
test('unconfirmed contrary direction and forming or weak flow never release or learn phantom entries',()=>{
 for(const block of ['forming','flow','structure','reversal','stale','future','room']){const r=runtime(),a=analysis();
 if(block==='forming'){a.metrics.shortModel.reversalCallConfirmed=false;a.metrics.shortModel.reversalCallCandidate=false;}if(block==='flow')a.metrics.micro.delta5=-.01;if(block==='structure'){a.metrics.shortModel.structureReadyCall=false;a.metrics.shortModel.reversalCallConfirmed=false;}if(block==='reversal')a.metrics.shortModel.reversalCallConfirmed=false;if(block==='room')a.metrics.shortModel.callRoomOk=false;
 const q=snap([99.99,100.01,100.02]);if(block==='stale')q.quoteTs=t-3000;if(block==='future')q.quoteTs=t+1;
 const o=r._operationalSignalState(a,q,t);assert.equal(o.actionable,false,block);assert.equal(o.scenario.side,'PUT',block);assert.equal(r.entryResearch.pending.length,0,block);assert.equal(r.signalValidation.pending.length,0,block);
 }
});
test('late point closes the opportunity and returning to its trigger cannot rearm it',()=>{
 const r=runtime(),a=analysis('CALL','CALL','continuation'),o=r._operationalSignalState(a,snap([100,100,100.2]),t);assert.equal(o.state,'OPORTUNIDADE PERDIDA');assert.equal(o.scenarioDeadline,t+120000);assert.equal(o.scenario.closed,false);
 assert.equal(r._operationalSignalState(a,snap([100.01,100.02],t+1000),t+1000).actionable,false);assert.equal(r.entryResearch.pending.length,0);
});
test('structural invalidation cancels main window and provider changes start a separate context',()=>{
 const r=runtime(),a=analysis(),first=r._operationalSignalState(a,snap([99,99]),t);const broken=r._operationalSignalState(a,snap([110,110],t+1000),t+1000);assert.equal(broken.state,'INVALIDADO');assert.equal(broken.scenarioDeadline,null);
 const other=r._operationalSignalState(a,snap([99.99,100.01,100.02],t+2000,'exnova'),t+2000);assert.notEqual(other.scenario.id,first.scenario.id);assert.equal(other.actionable,true);
});
test('entry learner freezes predictions, deduplicates, keeps context separate and excludes missing expiry',()=>{
 const e=new EntryResearch(),context={provider:'iq_option',asset:'TEST',durationMs:30000,kind:'reversal',side:'CALL',regime:'range',combo:'a'};const prediction=e.predict(context,[1],.8);e.record({id:'one',context,features:[1],baseline:.8,price:100,now:t,durationMs:30000,prediction});e.record({id:'one',context,features:[1],baseline:.8,price:100,now:t,durationMs:30000,prediction});assert.equal(e.pending.length,1);
 e.settle(snap([101],t+30000,'exnova'),t+30000);assert.equal(e.outcomes.length,0);e.settle(snap([101],t+30000),t+30000);assert.equal(e.outcomes.length,1);assert.equal(e.outcomes[0].modelProbability,.8);assert.equal(e.predict({...context,kind:'continuation'},[1],.8).samples,0);assert.equal(e.predict({...context,provider:'exnova'},[1],.8).samples,0);assert.equal(e.predict(context,[1],.8).qualified,false);
 const restored=new EntryResearch(e.snapshot());assert.equal(restored.summary().wins,1);
 restored.record({id:'missing',context,features:[1],baseline:.8,price:100,now:t+40000,durationMs:30000,prediction});restored.settle(snap([101],t+90000),t+90000);assert.equal(restored.unresolved,1);assert.equal(restored.outcomes.length,1);
});
test('quote coalescing evaluates the last update during both throttle and an ongoing evaluation',async()=>{
 let latest=1,busy=true,startFirst,releaseFirst;const started=new Promise(r=>startFirst=r),gate=new Promise(r=>releaseFirst=r),seen=[];
 const s=new LatestQuoteScheduler({intervalMs:20,isBusy:()=>busy,evaluate:async()=>{seen.push(latest);if(seen.length===1){startFirst();await gate;}}});
 try{s.request();latest=2;s.request();await pause(25);assert.equal(seen.length,0);busy=false;const firstDeadline=Date.now()+3000;while(seen.length<1&&Date.now()<firstDeadline)await pause(10);assert.equal(seen.length,1);latest=3;s.request();latest=4;s.request();releaseFirst();
 const deadline=Date.now()+3000;while(seen.length<2&&Date.now()<deadline)await pause(10);assert.deepEqual(seen,[2,4]);}finally{releaseFirst();s.close();}
});
test('qualification requires forward performance across sessions, and the target uses a confidence bound',()=>{
 const context={provider:'iq_option',asset:'TEST',durationMs:30000,kind:'reversal',side:'CALL',regime:'range',combo:'a'},e=new EntryResearch(),key=e.key(context);e.models[key]={bias:1,weights:[0],updates:120};
 e.outcomes=Array.from({length:120},(_,i)=>({id:String(i),key,createdAt:t+(i%3)*86400000,won:i<102,modelLoss:.1,baselineLoss:.3}));
 const qualified=e.predict(context,[1],.8);assert.equal(qualified.qualified,true);assert.equal(qualified.targetMet,false);
 e.outcomes.forEach(x=>x.createdAt=t);assert.equal(e.predict(context,[1],.8).qualified,false);
 e.outcomes.forEach((x,i)=>{x.createdAt=t+(i%3)*86400000;x.modelLoss=.4;});assert.equal(e.predict(context,[1],.8).qualified,false);
});

test('early CALL and PUT reversals do not wait for the old 15s direction or expiry forecast to flip',()=>{
 for(const side of ['CALL','PUT']){const call=side==='CALL',main=call?'PUT':'CALL',r=runtime(),a=analysis(main,side);
 a.metrics.micro.delta15=call?-.03:.03;a.metrics.shortModel[call?'turnUp':'turnDown']=true;a.metrics.shortModel[call?'flowReadyCall':'flowReadyPut']=false;
 // The old forecast still points to the other side and is unqualified.
 a.entryPlanner.horizons['30']={...plan(main,30,'forming'),directionReady:false,confidence:45,strategyFutureConflict:true,safety:{blocked:true}};
 const o=r._operationalSignalState(a,snap(call?[99.99,100.01,100.02]:[100.01,99.99,99.98]),t);
 assert.equal(o.actionable,true,side);assert.equal(o.side,side);assert.equal(o.scenario.side,main);assert.equal(o.entryAt,t);
 const v=scenarioViewFromRuntime({operational:o,asset:'TEST',horizonSeconds:120,durationMs:30000,forecast:a.entryPlanner.horizons['30'],now:t,minPoints:55});assert.equal(v.canEnter,true);assert.equal(v.displaySide,main);
 assert.equal(r.signalValidation.pending[0].probability,20,'baseline stays the old forecast probability, not a technical point score');
 }
});
test('continuations can enter on either side of an open window without a reversal label',()=>{
 for(const side of ['CALL','PUT']){const call=side==='CALL',r=runtime(),a=analysis(call?'PUT':'CALL',side,'continuation');
 a.entryPlanner.horizons['30']=plan(call?'PUT':'CALL',30,'forming');a.entryPlanner.horizons['30'].directionReady=false;
 const o=r._operationalSignalState(a,snap(call?[100,100,100.01]:[100,100,99.99]),t);assert.equal(o.actionable,true,side);assert.equal(o.side,side);assert.equal(o.entryAnalyst.kind,'continuation');assert.equal(o.scenario.side,call?'PUT':'CALL');
 }
});
test('an invalidated window accepts a new valid scenario before the old deadline, with no resurrection of broken levels',()=>{
 const r=runtime(),a=analysis('PUT','PUT','continuation');r._operationalSignalState(a,snap([100,100,100]),t);
 const closed=r._operationalSignalState(a,snap([110,110],t+500),t+500);assert.equal(closed.state,'INVALIDADO');
 const still=r._operationalSignalState(a,snap([110,110],t+1000),t+1000);assert.equal(still.state,'INVALIDADO');assert.equal(still.scenario.id,closed.scenario.id);
 const fresh=analysis('CALL','CALL','continuation'),o=r._operationalSignalState(fresh,snap([100,100,100.01],t+1500),t+1500);assert.equal(o.scenario.side,'CALL');assert.equal(o.scenario.createdAt,t+1500);assert.ok(t+1500<closed.scenario.deadline);assert.notEqual(o.scenario.id,closed.scenario.id);
});
test('a new local reaction inside the active burst cannot queue a duplicate entry',()=>{
 const r=runtime(),a=analysis(),first=r._operationalSignalState(a,snap([99.99,100.01,100.02]),t);assert.equal(first.actionable,true);
 r._operationalSignalState(a,snap([99.98,100.01,100.02],t+1000),t+1000);assert.equal(r.signalValidation.pending.length,1);assert.equal(r.entryResearch.pending.length,1);assert.equal(r.operationalSetup.firedAt,t);assert.equal(r.scenarioSetup.status,'OPEN');assert.equal(r.scenarioSetup.closed,false);
});


test('an unqualified forecast history cannot freeze the independent analyst before its own model validates',()=>{
 const r=runtime(),a=analysis(),first=r._operationalSignalState(a,snap([99.99,100.01,100.02]),t);assert.equal(first.actionable,true);
 const key=r.signalValidation.pending[0].key;r.signalValidation.outcomes=Array.from({length:60},()=>({key,won:false,draw:false,settlementQuality:'exact'}));
 r.scenarioSetup=null;r.operationalSetup=null;const next=r._operationalSignalState(a,snap([99.99,100.01,100.02],t+2000),t+2000);
 assert.equal(next.actionable,true);assert.equal(next.historyBlocked,false);assert.equal(next.validation.samples,60);assert.equal(next.entryResearch.qualified,false);
});

test('new same-side points keep separate entry prices and results while the scenario persists',()=>{
 const r=runtime(),a=analysis('PUT','CALL','continuation');
 const first=r._operationalSignalState(a,snap([100,100,100.01]),t),firstId=r.operationalSetup.key;
 assert.equal(first.actionable,true);const original={...r.entryResearch.pending[0]};
 const repeated=r._operationalSignalState(a,snap([100,100,100.01],t+4000),t+4000);
 assert.equal(repeated.actionable,false);assert.equal(r.entryResearch.pending.length,1);
 const second=r._operationalSignalState(a,snap([100.01,100.015,100.02],t+10000),t+10000);
 assert.equal(second.actionable,true);assert.notEqual(r.operationalSetup.key,firstId);
 assert.equal(second.scenario.id,first.scenario.id);assert.equal(second.scenario.deadline,t+120000);
 assert.equal(r.entryResearch.pending.length,2);assert.deepEqual(r.entryResearch.pending[0],original);
 assert.equal(r.entryResearch.pending[1].price,100.02);assert.equal(r.entryResearch.pending[1].createdAt,t+10000);
 r.entryResearch.settle(snap([100.005],t+30000),t+30000);
 assert.equal(r.entryResearch.outcomes.length,1);assert.equal(r.entryResearch.outcomes[0].won,false);assert.equal(r.entryResearch.pending.length,1);
 r.entryResearch.settle(snap([100.03],t+40000),t+40000);
 assert.equal(r.entryResearch.outcomes.length,2);assert.equal(r.entryResearch.outcomes[1].won,true);
});

test('main horizon rollover preserves the independent entry and its full expiry',()=>{
 const r=runtime();r.settings.forecastHorizonSeconds=30;r.settings.orderDurationMs=60000;
 const a=analysis('PUT','CALL');a.entryPlanner.horizons={'30':plan('PUT',30),'60':plan('CALL',60,'reversal')};
 const observing={...a,metrics:{...a.metrics,shortModel:{...a.metrics.shortModel,flowReadyCall:false,reversalCallConfirmed:false,reversalCallCandidate:false}}};
 r._operationalSignalState(observing,snap([100,100],t),t);
 const start=t+29000,first=r._operationalSignalState(a,snap([99.99,100.01,100.02],start),start),entryId=r.operationalSetup.key;
 assert.equal(first.actionable,true);assert.equal(first.activeUntil,start+3500);assert.equal(r.entryResearch.pending[0].dueAt,start+60000);
 const q={...snap([100.03],t+30500),quoteHistory:[{ts:start-400,price:99.99},{ts:start-200,price:100.01},{ts:start,price:100.02},{ts:t+30000,price:100.025},{ts:t+30500,price:100.03}]};
 const next=r._operationalSignalState(a,q,t+30500);
 assert.equal(next.actionable,true);assert.equal(next.scenario.id,first.scenario.id);assert.equal(next.scenario.closed,true);assert.equal(next.scenario.status,'JANELA ENCERRADA');assert.equal(r.operationalSetup.key,entryId);assert.equal(r.entryResearch.pending.length,1);
});

test('an isolated two-second retrace retains the setup and trigger evidence without phantom entry',()=>{
 const r=runtime(),a=analysis('CALL','CALL','continuation');
 const first=r._operationalSignalState(a,snap([100,100,100.01]),t),id=r.operationalSetup.key;
 const retrace=analysis('CALL','CALL','continuation');retrace.metrics.micro.delta2=-.002;retrace.metrics.shortModel.weakeningUp=true;
 const next=r._operationalSignalState(retrace,snap([100,100.01,100.008],t+400),t+400);
 assert.equal(next.scenario.id,first.scenario.id);assert.equal(next.scenario.closed,false);
 assert.equal(r.operationalSetup.key,id);assert.equal(r.operationalSetup.invalidated,false);assert.ok(r.operationalSetup.triggerQuotes.length>=2);assert.equal(r.entryResearch.pending.length,1);
 const contrary=analysis('CALL','CALL','continuation');contrary.metrics.micro.delta5=-.02;contrary.metrics.micro.delta2=-.01;contrary.metrics.shortModel.weakeningUp=true;
 const blocked=r._operationalSignalState(contrary,snap([100.008,100.006],t+600),t+600);
 assert.equal(blocked.actionable,false);assert.equal(blocked.scenario.closed,false);
});

test('missed entries require a genuinely later source, including opposite-side candidates',()=>{
 const r=runtime(),a=analysis('CALL','CALL','continuation');
 const missed=r._operationalSignalState(a,snap([100,100,100.2]),t);assert.equal(missed.actionable,false);
 const opposite=r._operationalSignalState(analysis('CALL','PUT'),snap([100.02,100,99.99],t+200),t+200);
 assert.equal(opposite.actionable,false,'an old extreme cannot rearm the missed opportunity');
 const fresh=r._operationalSignalState(analysis('CALL','PUT'),snap([100.02,100,99.99],t+1000),t+1000);
 assert.equal(fresh.actionable,true);assert.equal(fresh.side,'PUT');assert.equal(fresh.scenario.side,'CALL');
 assert.equal(r.entryResearch.pending.length,1);
});

test('entries from different providers never share a research identity at the same timestamp',()=>{
 const r=runtime(),a=analysis();
 assert.equal(r._operationalSignalState(a,snap([99.99,100.01,100.02],t,'iq_option'),t).actionable,true);
 assert.equal(r._operationalSignalState(a,snap([99.99,100.01,100.02],t,'exnova'),t).actionable,true);
 assert.equal(r.entryResearch.pending.length,2);assert.notEqual(r.entryResearch.pending[0].id,r.entryResearch.pending[1].id);
 assert.notEqual(r.entryResearch.pending[0].key,r.entryResearch.pending[1].key);
});

