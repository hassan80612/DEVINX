import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {brokerEntryBoundary} from '../sentinel-trading-lab/agent/src/core/broker-entry-boundary.mjs';
import {brokerClockView} from '../sentinel-trading-lab/agent/worker/broker-clock-view.mjs';
import {analystSnapshot,fitAnalystFrame} from '../sentinel-trading-lab/agent/worker/live-bridge.mjs';
import {liveCardModel} from '../sentinel-trading-lab/src/lib/live-card-model.ts';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
import {readFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const T=Date.UTC(2026,9,16,12);
const timing=(now,offset=0)=>({source:'broker-visible-readonly',capturedAt:now,instrumentKind:'blitz',
 brokerClock:{verified:true,source:'broker-protocol-timesync',capturedAt:now-2000,
  brokerNowMs:now+offset,ageMs:2000}});
const history=now=>Array.from({length:1801},(_,i)=>({ts:now-180000+i*100,price:Math.exp((now-T-180000+i*100)/1000*.000005)}));
const boundary=(now,patch={})=>brokerEntryBoundary({clockMode:'broker',durationMs:30000,timing:timing(now),
 now,quoteAt:now,asset:'EUR/GBP OTC',provider:'iq_option',...patch});
function runtime(mode='broker'){
 const r=new DemoTradingRuntime({enableVNext:true,forecastModel:'now-structural-v1'});
 r.settings={...r.settings,clockMode:mode,engine:'automatic',asset:'EUR/GBP OTC',orderDurationMs:30000};return r;
}
function evaluate(r,now,{quoteAt=now,rows=history(quoteAt),clock=timing(now),monotonicNow=()=>0}={}){
 r.setExternalMarket({provider:'iq_option',symbol:r.settings.asset,quoteHistory:rows,quote:rows.at(-1).price,
  quoteTs:quoteAt,brokerTiming:clock,quoteFeedValidated:true,analysisFeedValidated:true,feedValidated:true});
 const snap=r._marketSnapshot();
 const result=r._signalValidationGate({analysis:{asset:r.settings.asset},snap,settings:r.settings,now,monotonicNow}).analysis;
 r.lastResult={asset:r.settings.asset,analysis:result};r.lastEvalMs=now;
 return result.vnext;
}
test('synchronized 30s admission uses ONLY broker :30, never :00, and never a pre-boundary quote',()=>{
 assert.equal(boundary(T).allowed,false);
 assert.equal(boundary(T+500).allowed,false);
 assert.equal(boundary(T+29999).allowed,false);
 assert.equal(boundary(T+30000).allowed,true);
 assert.equal(boundary(T+30999).allowed,true);
 assert.equal(boundary(T+31000).allowed,false);
 assert.equal(boundary(T+60000).allowed,false);
 assert.equal(boundary(T+60900).allowed,false);
 assert.equal(boundary(T+90000).allowed,true);
 const stale=boundary(T+30100,{quoteAt:T+29999});
 assert.equal(stale.allowed,false);assert.equal(stale.reason,'waiting-new-quote-at-broker-boundary');
});
test('broker time offset advances once and translates the fixed deadline into the PC clock',()=>{
 const now=T+18100,b=boundary(now,{timing:timing(now,12000)});
 assert.equal(b.allowed,true);assert.equal(b.localBoundaryAt,T+18000);
 assert.equal(b.brokerBoundaryAt,T+30000);assert.equal(b.exitAt,T+48000);
 assert.equal(b.brokerWallExpiryAt,T+60000);assert.equal(b.entryValidUntil,T+19000);
});
test('unknown, stale and visually rounded clocks cannot authorize a synchronized entry',()=>{
 for(const clock of [null,{brokerClock:{verified:false}},
  {brokerClock:{verified:true,source:'visible-broker-clock',capturedAt:T+30000,clockSeconds:30}},
  {brokerClock:{verified:true,source:'broker-protocol-timesync',capturedAt:T-1000,brokerNowMs:T+30000,ageMs:31000}}])
  assert.equal(boundary(T+30000,{timing:clock}).allowed,false);
});
test('a known expired or different fixed broker expiry cannot be presented as the next 30s option',()=>{
 const now=T+30100;
 for(const expiresAt of [now-1,T+120000]){
  const t={...timing(now),selectedExpiration:{kind:'fixed-clock',confidence:1,expiresAt}};
  assert.equal(boundary(now,{timing:t}).allowed,false);
 }
 assert.equal(boundary(now,{timing:{...timing(now),selectedExpiration:{kind:'fixed-clock',confidence:1,expiresAt:T+60000}}}).allowed,true);
});
test('clock current keeps immediate admission; broker mode still requires actual directional evidence',()=>{
 assert.equal(evaluate(runtime('current'),T+17000).futureEntryAnchor.entryReadyNow,true);
 assert.equal(evaluate(runtime('current'),T+60000).futureEntryAnchor.entryReadyNow,true);
 assert.equal(evaluate(runtime(),T+17000).futureEntryAnchor,null);
 assert.equal(evaluate(runtime(),T+60000).futureEntryAnchor,null);
 const r=runtime(),now=T+30000;
 const v=evaluate(r,now,{rows:[{ts:now,price:1}]});assert.equal(v.futureEntryAnchor,null);
});
test('the runtime pins expiry to the next boundary, holds the side and never repeats a consumed boundary',()=>{
 const r=runtime(),now=T+30100,v=evaluate(r,now),first=v.futureEntryAnchor;
 assert.equal(first.entryReadyNow,true);assert.equal(first.entryAt,now);
 assert.equal(first.exitAt,T+60000);assert.equal(first.entryValidUntil,T+31000);
 assert.equal(first.brokerExpiresAt,first.exitAt);
 const held=evaluate(r,T+45000).futureEntryAnchor;
 assert.equal(held.side,first.side);assert.equal(held.exitAt,first.exitAt);assert.equal(held.entryReadyNow,false);
 const duplicate=runtime();evaluate(duplicate,now);duplicate.vnextWindowState=null;
 assert.equal(evaluate(duplicate,now+100).futureEntryAnchor,null);
 const noEntryAtMinuteStart=evaluate(r,T+60100).futureEntryAnchor;
 assert.equal(noEntryAtMinuteStart,null,'synchronized mode must never fire at :00');
 const next=evaluate(r,T+90100).futureEntryAnchor;
 assert.equal(next.entryReadyNow,true);assert.equal(next.exitAt,T+120000);
});
test('an evaluation that finishes after the eligible second cannot produce a late entry',()=>{
 const r=runtime(),values=[0,200];
 const v=evaluate(r,T+30900,{monotonicNow:()=>values.shift()});
 assert.equal(v.futureEntryAnchor,null);assert.equal(v.nowObservation.reason,'waiting-next-broker-boundary');
});
test('PC-to-mobile compact frame preserves the original deadline and refuses a delayed ENTRY NOW',()=>{
 const r=runtime(),now=T+30100,v=evaluate(r,now),first=v.futureEntryAnchor;
 const save=Date.now;let frame;
 try{Date.now=()=>now;frame=analystSnapshot({state:'running',settings:r.settings,lastEvalMs:now,lastResult:r.lastResult},
  {symbol:r.settings.asset,validatedSymbol:r.settings.asset,assetValidated:true,analysisFeedValidated:true,
   quote:Math.exp(.15),lastQuoteAt:now,brokerTiming:timing(now)});}finally{Date.now=save;}
 frame.lastResult.analysis.vnext.cards=[{id:'x'.repeat(5000)}];frame=fitAnalystFrame(frame);
 assert.ok(frame);assert.ok(Buffer.byteLength(JSON.stringify(frame))<=3000);
 const mobile=liveCardModel(frame,now+100),anchor=mobile.vnextFutureEntryAnchor;
 assert.equal(anchor.exitAt,first.exitAt);assert.equal(anchor.entryValidUntil,first.entryValidUntil);
 assert.equal(anchor.brokerWallExpiryAt,T+60000);
 const args={windowStartedAt:mobile.vnextOpportunityWindow.windowStartedAt,windowEndsAt:anchor.exitAt,
  phase:anchor.phase,side:anchor.side,entryTriggeredAt:anchor.entryTriggeredAt,quoteAt:now,entryValidUntil:anchor.entryValidUntil};
 assert.equal(pcAuthoritativeWindow({...args,now:now+100}).enterNow,true);
 const late=pcAuthoritativeWindow({...args,now:T+31000});
 assert.equal(late.enterNow,false);assert.equal(late.active,true);assert.equal(late.remainingSeconds,29);
 assert.equal(pcAuthoritativeWindow({...args,now:T+60000}).active,false);
 const unavailable=brokerClockView({timing:null,windowState:{phase:'fired',entryTriggeredAt:first.entryTriggeredAt,
  brokerExpiresAt:first.exitAt,exitAt:first.exitAt},now:now+1000});
 assert.equal(unavailable.expiresAt,first.exitAt);assert.equal(unavailable.verified,true);
});
test('the actual PC timer clears an expired entry indication without a new frame or a counter reset',()=>{
 const source=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const begin=source.indexOf('const tickTargetClock=()=>{'),end=source.indexOf('el.__sentinelTargetClockTick=',begin);
 assert.ok(begin>0&&end>begin);
 let now=T+30100;const value={textContent:'',style:{}},decision={textContent:''},status={textContent:''},brokerStatus={textContent:''};
 const attrs={'data-deadline':T+60000,'data-issued':T+30100,'data-triggered-at':T+30100,
  'data-entry-valid-until':T+31000,'data-broker-expiry':T+60000,'data-entry-ready':'1',
  'data-live-quote':'1','data-mode':'now','data-side':'CALL','data-window-phase':'fired'};
 const action={querySelector:q=>q==='[data-sentinel-decision-label]'?decision:null};
 const pane={getAttribute:k=>String(attrs[k]??''),closest:()=>({querySelector:()=>action}),
  querySelector:q=>q==='[data-sentinel-vnext-clock-value]'?value:q==='[data-sentinel-cycle-status]'?status:brokerStatus};
 const context={el:{querySelector:()=>pane},tr:s=>s,Date:{now:()=>now},
  window:{__sentinelLastOverlayData:{clockMode:'broker',vnext:{mode:'now'},
   brokerClockView:brokerClockView({timing:timing(now),now})}}};
 vm.createContext(context);vm.runInContext(source.slice(begin,end)+'globalThis.tick=tickTargetClock;',context);
 context.tick();assert.match(decision.textContent,/ENTRADA AGORA/);assert.equal(value.textContent,'00:30');
 now=T+31000;context.tick();assert.match(decision.textContent,/OPERAÇÃO EM ANDAMENTO/);
 assert.doesNotMatch(decision.textContent,/ENTRADA AGORA/);assert.equal(value.textContent,'00:29');
 now=T+36000;context.tick();assert.equal(value.textContent,'00:24');
 now=T+60000;context.tick();assert.doesNotMatch(decision.textContent,/ENTRADA AGORA/);
});
test('the actual React card keeps the PC deadline and drops late entry text even on its cached frame',()=>{
 const url=new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),require=createRequire(url);
 const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const component=new Module(fileURLToPath(url));
 component.require=name=>name==='./SentinelLocale'?{useSentinelLocale:()=>({t:s=>s,locale:'pt'})}:
  name==='../lib/live-card-model'?require('../lib/live-card-model.ts'):require(name);
 component._compile(ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,fileURLToPath(url));
 const r=runtime(),at=T+30100;evaluate(r,at);
 const state={state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:r.settings,lastEvalMs:at,
  lastResult:r.lastResult,liveBroker:{symbol:r.settings.asset,assetValidated:true,analysisFeedValidated:true,
   lastQuoteAt:at,quote:1.1,brokerTiming:timing(at)}};
 const render=now=>{const save=Date.now;Date.now=()=>now;try{return renderToStaticMarkup(React.createElement(component.exports.LiveScenarioCard,
  {s:state,busy:false,act:async()=>{},compact:true,onToggleCompact:()=>{}}));}finally{Date.now=save;}};
 assert.match(render(at+100),/ENTRADA AGORA/);
 const late=render(T+31100);assert.doesNotMatch(late,/ENTRADA AGORA/);
 assert.match(late,/OPERAÇÃO EM ANDAMENTO/);assert.match(late,/00:29/);
});
