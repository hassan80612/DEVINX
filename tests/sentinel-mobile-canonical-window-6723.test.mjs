import test from 'node:test';
import assert from 'node:assert/strict';
import {pcAuthoritativeWindow} from '../sentinel-trading-lab/src/lib/pc-authoritative-window.mjs';
import {acceptSignedPcFrame,keepSignedViewOverCloud} from '../sentinel-trading-lab/src/lib/signed-pc-window-order.mjs';
const t=1800000000000;
const state=(start,phase='scanning',side=null,triggered=0,evalAt=t+1000)=>({
 liveTopic:'realtime:sentinel-'+'a'.repeat(48),
 liveTransport:'push',liveStreamAt:t+1000,
 remote:{online:true},state:'running',lastEvalMs:evalAt,
 settings:{engine:'breakout',orderDurationMs:30000,forecastMode:'continuous'},
 liveBroker:{validatedSymbol:'EUR/GBP OTC',lastQuoteAt:evalAt},
 lastResult:{asset:'EUR/GBP OTC',analysis:{vnext:{
  ow:[phase,start,start+30000,triggered,'test'],
  ea:side?[30,side,1.1,1.101,start+10,30,triggered||start+12000,
    (triggered||start+12000)+30000,triggered?0:1,phase,triggered]:null
 }}}});
test('fired signed Agent frame wins over newer ordinary cloud evaluation in the same window',()=>{
 const cloud=state(t,'scanning',null,0,t+23000);
 const signed=state(t,'fired','CALL',t+12000,t+12050);
 assert.equal(acceptSignedPcFrame(cloud,signed),true);
 assert.equal(acceptSignedPcFrame(signed,cloud),false);
 assert.equal(acceptSignedPcFrame(cloud,state(t,'open','PUT',0,t+14000)),true);
 assert.equal(acceptSignedPcFrame(signed,state(t+30000,'scanning',null,0,t+30050)),true);
 assert.equal(acceptSignedPcFrame(state(t+30000),signed),false);
});
test('cloud polling cannot replace fresh signed CALL/PUT with ANALISANDO',()=>{
 const received=state(t,'fired','PUT',t+18000);
 const lateCloud=state(t,'scanning',null,0,t+19000);
 assert.equal(keepSignedViewOverCloud(received,lateCloud,{now:t+2200}),true);
 assert.equal(keepSignedViewOverCloud(received,lateCloud,{now:t+8000}),false);
 assert.equal(keepSignedViewOverCloud(received,{...lateCloud,liveTopic:'other'},{now:t+2100}),false);
 assert.equal(keepSignedViewOverCloud(received,{...lateCloud,remote:{online:false}},{now:t+2100}),false);
});
test('mobile mirrors CALL AGORA, then historical ENTRADA JÁ SINALIZADA, without inventing a new trade',()=>{
 const win={windowStartedAt:t,windowEndsAt:t+30000,phase:'fired',side:'CALL',entryTriggeredAt:t+13000};
 const active=pcAuthoritativeWindow({...win,quoteAt:t+13400,now:t+13500});
 assert.equal(active.label,'ENTRADA AGORA · ↑ CALL');
 const late=pcAuthoritativeWindow({...win,quoteAt:t+20000,now:t+20000});
 assert.equal(late.label,'ENTRADA JÁ SINALIZADA · ↑ CALL');
 assert.equal(late.enterNow,false);
 const after=pcAuthoritativeWindow({...win,quoteAt:t+35000,now:t+35000});
 assert.equal(after.label,'ENTRADA JÁ SINALIZADA · ↑ CALL');
 assert.equal(after.enterNow,false);
});
test('PUT is never guessed, and missing/expired PC frames do not put AGUARDANDO PC on screen',()=>{
 const put=pcAuthoritativeWindow({windowStartedAt:t,windowEndsAt:t+30000,phase:'fired',side:'PUT',entryTriggeredAt:t+17000,quoteAt:t+17200,now:t+17500});
 assert.equal(put.label,'ENTRADA AGORA · ↓ PUT');
 const noWindow=pcAuthoritativeWindow({now:t+500});
 assert.equal(noWindow.label,'');
 const expired=pcAuthoritativeWindow({windowStartedAt:t,windowEndsAt:t+30000,phase:'open',side:'PUT',quoteAt:t+40000,now:t+40000});
 assert.equal(expired.label,'');
 assert.equal(expired.active,false);
});

test('first authenticated PC signal always replaces cloud without window, even with older evaluation time',()=>{
 const cloud={...state(t,'scanning',null,0,t+25000),lastResult:{asset:'EUR/GBP OTC',analysis:{}}};
 const fired=state(t,'fired','PUT',t+11000,t+11050);
 assert.equal(acceptSignedPcFrame(cloud,fired),true);
 assert.equal(keepSignedViewOverCloud(fired,{...cloud,lastEvalMs:t+25000},{now:t+2500}),true);
});
