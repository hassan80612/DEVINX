import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {EntryResearch} from '../sentinel-trading-lab/agent/src/core/entry-research.mjs';
import {scenarioViewFromRuntime} from '../sentinel-trading-lab/agent/worker/scenario-view.mjs';
import {LatestQuoteScheduler} from '../sentinel-trading-lab/agent/worker/latest-quote-scheduler.mjs';
const t=Date.UTC(2026,9,8,12),pause=ms=>new Promise(r=>setTimeout(r,ms));
function runtime(){const r=new DemoTradingRuntime();Object.assign(r.settings,{asset:'TEST',forecastHorizonSeconds:120,orderDurationMs:30000,futureDisplayThreshold:70});r.settings.risk.minConfidence=55;return r;}
function plan(side,horizon,kind='continuation'){const call=side==='CALL';return{asset:'TEST',horizonSeconds:horizon,rawBias:side,bias:side,outlookReady:true,directionReady:true,confidence:80,agreement:80,callProbability:call?80:20,putProbability:call?20:80,strategyFutureBias:side,strategyFuture:{confidence:80,activeCount:1,evidence:80},callTrigger:100,putTrigger:100,callInvalidation:90,putInvalidation:110,expectedMove:.1,entryTiming:{maxDistance:.05},scenario:{kind,continuationReady:kind==='continuation',reversalConfirmed:kind==='reversal'}};}
function analysis(main='PUT',entry='CALL',kind='reversal'){const call=entry==='CALL';return{quality:{entrySide:call?'BUY':'SELL'},generalConsensus:{rapid:{side:entry},strategies:{side:entry,strength:80}},metrics:{micro:{delta5:call?.01:-.01,delta15:call?.01:-.01},shortModel:{ready:true,flowReadyCall:call,structureReadyCall:call,callRoomOk:call,flowReadyPut:!call,structureReadyPut:!call,putRoomOk:!call,reversalCallConfirmed:call,reversalPutConfirmed:!call}},entryPlanner:{horizons:{'120':plan(main,120),'30':plan(entry,30,kind)}}};}
const snap=(prices,now=t,provider='iq_option')=>({provider,asset:'TEST',price:prices.at(-1),quoteTs:now,quoteHistory:prices.map((price,i)=>({price,ts:now-(prices.length-i-1)*200}))});
test('PUT scenario survives a confirmed CALL entry at 30s with distinct headline and expiry',()=>{
 const r=runtime(),a=analysis(),o=r._operationalSignalState(a,snap([99.99,100.01,100.02]),t);
 assert.equal(o.actionable,true);assert.equal(o.side,'CALL');assert.equal(o.scenario.side,'PUT');assert.equal(o.entryDecisionHorizonSeconds,30);assert.equal(r.entryResearch.pending.length,1);
 const v=scenarioViewFromRuntime({operational:o,asset:'TEST',horizonSeconds:120,durationMs:30000,forecast:a.entryPlanner.horizons['30'],now:t,minPoints:55});assert.equal(v.canEnter,true);assert.equal(v.displaySide,'PUT');assert.equal(v.entrySide,'CALL');
 const flip=analysis('CALL','CALL');const next=r._operationalSignalState(flip,snap([100.02,100.02],t+500),t+500);assert.equal(next.scenario.side,'PUT');assert.equal(next.scenario.deadline,t+120000);assert.equal(r.entryResearch.pending.length,1);
 const ended=r._operationalSignalState(a,snap([100.02,100.02],t+4000),t+4000);assert.equal(ended.state,'OPORTUNIDADE CONSUMIDA');assert.equal(ended.actionable,false);assert.equal(ended.scenarioDeadline,null);
 const late=r._operationalSignalState(analysis('PUT','PUT'),snap([99.99,99.98],t+10000),t+10000);assert.equal(late.actionable,false);assert.equal(r.entryResearch.pending.length,1);
 const closed=scenarioViewFromRuntime({operational:ended,asset:'TEST',horizonSeconds:120,durationMs:30000,now:t+4000});assert.equal(closed.deadline,null);assert.equal(closed.closed,true);
});
test('unconfirmed contrary direction and forming or weak flow never release or learn phantom entries',()=>{
 for(const block of ['forming','flow','structure','reversal','stale','future','safety','continuation-opposite']){const r=runtime(),a=analysis();
 if(block==='forming')a.entryPlanner.horizons['30'].scenario.kind='forming';if(block==='flow')a.metrics.shortModel.flowReadyCall=false;if(block==='structure')a.metrics.shortModel.structureReadyCall=false;if(block==='reversal')a.entryPlanner.horizons['30'].scenario.reversalConfirmed=false;if(block==='safety')a.entryPlanner.horizons['30'].safety={blocked:true};if(block==='continuation-opposite')a.entryPlanner.horizons['30']=plan('CALL',30);
 const q=snap([99.99,100.01,100.02]);if(block==='stale')q.quoteTs=t-3000;if(block==='future')q.quoteTs=t+1;
 const o=r._operationalSignalState(a,q,t);assert.equal(o.actionable,false,block);assert.equal(o.scenario.side,'PUT',block);assert.equal(r.entryResearch.pending.length,0,block);assert.equal(r.signalValidation.pending.length,0,block);
 }
});
test('late point closes the opportunity and returning to its trigger cannot rearm it',()=>{
 const r=runtime(),a=analysis('CALL','CALL','continuation'),o=r._operationalSignalState(a,snap([100.1,100.2]),t);assert.equal(o.state,'OPORTUNIDADE PERDIDA');assert.equal(o.scenarioDeadline,null);
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
 try{s.request();latest=2;s.request();await pause(25);assert.equal(seen.length,0);busy=false;await started;latest=3;s.request();latest=4;s.request();releaseFirst();
 const deadline=Date.now()+3000;while(seen.length<2&&Date.now()<deadline)await pause(10);assert.deepEqual(seen,[2,4]);}finally{releaseFirst();s.close();}
});
test('qualification requires forward performance across sessions, and the target uses a confidence bound',()=>{
 const context={provider:'iq_option',asset:'TEST',durationMs:30000,kind:'reversal',side:'CALL',regime:'range',combo:'a'},e=new EntryResearch(),key=e.key(context);e.models[key]={bias:1,weights:[0],updates:120};
 e.outcomes=Array.from({length:120},(_,i)=>({id:String(i),key,createdAt:t+(i%3)*86400000,won:i<102,modelLoss:.1,baselineLoss:.3}));
 const qualified=e.predict(context,[1],.8);assert.equal(qualified.qualified,true);assert.equal(qualified.targetMet,false);
 e.outcomes.forEach(x=>x.createdAt=t);assert.equal(e.predict(context,[1],.8).qualified,false);
 e.outcomes.forEach((x,i)=>{x.createdAt=t+(i%3)*86400000;x.modelLoss=.4;});assert.equal(e.predict(context,[1],.8).qualified,false);
});
