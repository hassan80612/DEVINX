import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pcWindowInfo,reconcileSignedPcOpportunity,reconcileCloudPcOpportunity,
 acceptSignedPcFrame,keepSignedViewOverCloud
} from '../sentinel-trading-lab/src/lib/signed-pc-window-order.mjs';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
const start=1800000000000,asset='EUR/GBP OTC',topic='realtime:sentinel-'+'a'.repeat(48);
const status=({startAt=start,phase='open',side='CALL',evalAt=start+10000,
 signed=true,quoteAt=start+10000,mode='continuous'}={})=>({
 liveTopic:topic,liveTransport:signed?'push':undefined,liveStreamAt:start+10000,
 pcClockOffsetMs:2340,pcClockRttMs:83,state:'running',remote:{online:true},
 lastEvalMs:evalAt,settings:{engine:'breakout',forecastMode:mode,orderDurationMs:30000},
 liveBroker:{symbol:asset,validatedSymbol:asset,lastQuoteAt:quoteAt,quote:0.8452},
 lastResult:{asset,analysis:{vnext:{engineId:'breakout',expirySeconds:30,
   ...(startAt!=null?{ow:[phase,startAt,startAt+30000,startAt+13500,'confirmed']}:{}),
   ea:side?[30,side,0.845,0.849,startAt+100,30,startAt+13500,startAt+43500,
       phase==='fired'?1:0,phase,phase==='fired'?startAt+13500:0]:null
 }}}});
const windowOf=s=>{const w=pcWindowInfo(s);return pcAuthoritativeWindow({
 windowStartedAt:w.start,windowEndsAt:w.end,phase:w.phase,
 side:s?.lastResult?.analysis?.vnext?.ea?.[1]||null,
 quoteAt:s.liveBroker.lastQuoteAt,now:start+12000
})};
test('missing source window never erases running PC opportunity but keeps newest live quote',()=>{
 const previous=status();
 const empty=status({startAt:null,side:null,evalAt:start+13000,quoteAt:start+13000});
 const received=reconcileSignedPcOpportunity(previous,empty);
 assert.equal(pcWindowInfo(received).start,start);
 assert.equal(pcWindowInfo(received).phase,'open');
 assert.equal(received.liveBroker.lastQuoteAt,start+13000);
 assert.equal(acceptSignedPcFrame(previous,received),true);
 assert.equal(windowOf(received).remainingSeconds,18);
});
test('cloud poll after six seconds cannot wipe the source window or its PC clock',()=>{
 const prior=status();
 const cloud=status({startAt:null,side:null,evalAt:start+18000,signed:false});
 delete cloud.pcClockOffsetMs;delete cloud.pcClockRttMs;
 delete cloud.liveTransport;delete cloud.liveStreamAt;
 const merged=reconcileCloudPcOpportunity(prior,cloud);
 assert.equal(pcWindowInfo(merged).start,start);
 assert.equal(merged.pcClockOffsetMs,2340);
 assert.equal(merged.pcClockRttMs,83);
 assert.equal(merged.liveTransport,'push');
 assert.equal(merged.liveStreamAt,start+10000);
 assert.equal(windowOf(merged).remainingSeconds,18);
 assert.equal(keepSignedViewOverCloud(prior,cloud,{now:start+18000}),false);
});
test('a real next PC window replaces old one without any invented count',()=>{
 const old=status({phase:'fired'});
 const next=status({startAt:start+30000,phase:'scanning',side:null,evalAt:start+30010});
 const merged=reconcileSignedPcOpportunity(old,next);
 assert.equal(pcWindowInfo(merged).start,start+30000);
 assert.equal(pcWindowInfo(merged).phase,'scanning');
 assert.equal(acceptSignedPcFrame(old,merged),true);
 const view=pcAuthoritativeWindow({windowStartedAt:start+30000,
 windowEndsAt:start+60000,phase:'scanning',now:start+30500});
 assert.equal(view.remainingSeconds,30);
});
test('a stale or incomplete cloud frame cannot demote fired CALL to ANALISANDO',()=>{
 const fired=status({phase:'fired',evalAt:start+14000});
 const scan=status({phase:'scanning',side:null,evalAt:start+17000,signed:false});
 const cloud=reconcileCloudPcOpportunity(fired,scan);
 assert.equal(pcWindowInfo(cloud).phase,'fired');
 assert.equal(pcWindowInfo(cloud).triggeredAt,start+13500);
 const incoming=reconcileSignedPcOpportunity(fired,scan);
 assert.equal(acceptSignedPcFrame(fired,incoming),true);
 assert.equal(pcWindowInfo(incoming).phase,'fired');
});
test('real PC stop, asset switch and engine switch are not suppressed',()=>{
 const old=status(),stopped=status({startAt:null,side:null});
 stopped.state='stopped';
 assert.equal(pcWindowInfo(reconcileCloudPcOpportunity(old,stopped)).start,0);
 const newAsset=status({startAt:null,side:null});
 newAsset.liveBroker.symbol='USD/JPY OTC';newAsset.liveBroker.validatedSymbol='USD/JPY OTC';
 assert.equal(pcWindowInfo(reconcileSignedPcOpportunity(old,newAsset)).start,0);
 const newEngine=status({startAt:null,side:null});newEngine.settings.engine='automatic';
 assert.equal(pcWindowInfo(reconcileSignedPcOpportunity(old,newEngine)).start,0);
});
test('a signed window does not restart itself after the end; keep 00:00 awaiting source',()=>{
 const prior=status();
 const seen=pcAuthoritativeWindow({windowStartedAt:start,windowEndsAt:start+30000,
 phase:'open',side:'CALL',now:start+30500});
 assert.equal(seen.active,false);
 assert.equal(seen.remainingSeconds,0);
 assert.notEqual(seen.remainingSeconds,null);
 assert.equal(seen.enterNow,false);
 const after=pcAuthoritativeWindow({windowStartedAt:start,windowEndsAt:start+30000,
 phase:'open',side:'CALL',now:start+47000});
 assert.equal(after.remainingSeconds,0);
});
test('mobile site keeps source first in both updates and does not rewrite the Agent',()=>{
 const page=readFileSync('sentinel-trading-lab/src/app/console/page.tsx','utf8');
 assert.match(page,/reconcileSignedPcOpportunity\(previous,payload\)/);
 assert.match(page,/reconcileCloudPcOpportunity\(previous,data\)/);
 assert.match(page,/pcClockOffsetMs/);
 const source=readFileSync('sentinel-trading-lab/agent/release.json','utf8');
 assert.match(source,/"version": "13\.4\.67\.24"/);
});
