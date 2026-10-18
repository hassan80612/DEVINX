import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoTradingRuntime as Released} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
const Runtime=Released;
const T=Date.UTC(2026,9,18,16);
const history=Array.from({length:181},(_,i)=>({ts:T-(180-i)*1000,receivedAt:T-(180-i)*1000,price:1.1*Math.exp(i*.000002)}));
const fresh=()=>new Runtime({enableVNext:true,forecastModel:'now-structural-v1'});
const gate=(rt,{provider='iq_option',asset='EUR/USD',now=T,quotes=history,price=quotes.at(-1).price}={})=>{
 const settings={...rt.settings,engine:'automatic',asset,orderDurationMs:30000};
 return rt._signalValidationGate({analysis:{asset},settings,now,snap:{provider,price,quoteTs:now,quoteHistory:quotes,candles:[],historicalCandlesVerified:true}}).analysis.vnext;
};
test('switching broker with the same symbol cannot display the previous broker held signal',()=>{
 const rt=fresh(),first=gate(rt);
 assert.equal(first.futureEntryAnchor?.side,'CALL');
 const now=T+1000,q={ts:now,price:1.1};
 const changed=gate(rt,{provider:'exnova',now,quotes:[q]});
 assert.equal(changed.futureEntryAnchor,null);
 assert.equal(changed.opportunityWindow.phase,'scanning');
});
for(const [name,provider,asset] of [['different asset','iq_option','USD/BRL'],['different broker','exnova','EUR/USD']]){
 test('expiry cannot be graded with the '+name+' price',()=>{
  const rt=fresh();gate(rt);const pending=rt.vnextWindowOutcomes[0];assert.equal(pending.verified,false);
  const now=T+30000,q={ts:now,price:5};gate(rt,{provider,asset,now,quotes:[q]});
  assert.equal(pending.verified,false,'other market must not fabricate a completed outcome');
 });
}
test('current displayed quality excludes other markets and strategies instead of pooling them',()=>{
 const rt=fresh();
 rt.vnextWindowOutcomes=[
  {provider:'iq_option',asset:'EUR/USD',engineId:'automatic',periodSeconds:30,forecastMode:'now',verified:true,correct:false},
  {provider:'exnova',asset:'EUR/USD',engineId:'automatic',periodSeconds:30,forecastMode:'now',verified:true,correct:true},
  {provider:'iq_option',asset:'USD/BRL',engineId:'automatic',periodSeconds:30,forecastMode:'now',verified:true,correct:true},
  {provider:'iq_option',asset:'EUR/USD',engineId:'trend',periodSeconds:30,forecastMode:'now',verified:true,correct:true}];
 const v=gate(rt,{quotes:[history.at(-1)]});
 assert.equal(v.outcomeQuality.completed,1);assert.equal(v.outcomeQuality.correct,0);assert.equal(v.outcomeQuality.failed,1);
 assert.equal(rt.vnextWindowOutcomes.length,4,'retain bounded existing records; only isolate displayed context');
});
test('same-market expiry still grades normally and held signals remain immutable',()=>{
 const rt=fresh(),first=gate(rt),entry=first.futureEntryAnchor;
 const now=T+1000,q={ts:now,price:entry.entryPrice*.999};
 const held=gate(rt,{now,quotes:[...history,q]});assert.equal(held.futureEntryAnchor.side,'CALL');assert.equal(held.futureEntryAnchor.entryAt,T);
 const exit={ts:T+30000,price:entry.entryPrice*1.001};gate(rt,{now:exit.ts,quotes:[...history,q,exit]});
 assert.equal(rt.vnextWindowOutcomes[0].verified,true);assert.equal(rt.vnextWindowOutcomes[0].correct,true);
});
