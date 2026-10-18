import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
const T=Date.UTC(2026,9,18,16),realNow=Date.now;
test.after(()=>{Date.now=realNow;});
function setup(provider){
 Date.now=()=>T+200;
 const d=new LocalPlaywrightDriver({dataDir:'ignored'}),s=d.state(provider);
 Object.assign(s,{activeId:76,candleActiveId:76,candleSize:60,symbol:'EUR/USD',uiSymbol:'EUR/USD'});
 d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.1005,time:T/1000}},'page-in');
 return {d,s};
}
const event=(size,from,to,close,extra={})=>({name:'candle-generated',msg:{active_id:76,size,from:from/1000,to:to/1000,
 open:1.1001,close,high:Math.max(1.101,close),low:1.099,...extra}});
for(const provider of ['iq_option','exnova']){
 test(provider+': a delayed closed minute candle cannot become a fresh quote',()=>{
  const {d,s}=setup(provider),history=[...s.quoteHistory];
  d.ingest(provider,event(60,T-120000,T-60000,1.1001),'page-in');
  assert.equal(s.quote,1.1005);assert.equal(s.lastQuoteAt,T);assert.deepEqual(s.quoteHistory,history);
 });
 test(provider+': delayed one-second candles cannot roll the price back on either socket',()=>{
  for(const direction of ['page-in','direct-in']){
   const {d,s}=setup(provider);d.ingest(provider,event(1,T-2000,T-1000,1.1001),direction);
   assert.equal(s.quote,1.1005);assert.equal(s.lastQuoteAt,T);
  }
 });
 test(provider+': an older timestamped forming candle cannot fabricate a reversal',()=>{
  const {d,s}=setup(provider);d.ingest(provider,event(60,T,T+60000,1.1001,{at:(T-1000)*1000}),'page-in');
  assert.equal(s.quote,1.1005);assert.equal(s.lastQuoteAt,T);
 });
 test(provider+': current candle timestamps must leave a later actual quote admissible',()=>{
  for(const at of [(T+100)/1000,T+100,(T+100)*1000,(T+100)*1000000]){
   const {d,s}=setup(provider);d.ingest(provider,event(60,T,T+60000,1.1006,{at}),'page-in');
   assert.equal(s.quote,1.1006);assert.equal(s.lastQuoteAt,T+100);
   d.ingest(provider,{name:'quote-generated',msg:{active_id:76,price:1.10065,time:(T+150)/1000}},'page-in');
   assert.equal(s.quote,1.10065);assert.equal(s.lastQuoteAt,T+150);
  }
 });
 test(provider+': untimestamped forming candles preserve healthy explicit quotes',()=>{
  const {d,s}=setup(provider);d.ingest(provider,event(60,T,T+60000,1.1001),'page-in');
  assert.equal(s.quote,1.1005);assert.equal(s.lastQuoteAt,T);
 });
 test(provider+': a candle-only live feed still updates without waiting for a separate quote stream',()=>{
  const {d,s}=setup(provider);s.quote=null;s.lastQuoteAt=null;s.quoteHistory=[];
  d.ingest(provider,event(60,T,T+60000,1.1006),'page-in');
  assert.equal(s.quote,1.1006);assert.equal(s.lastQuoteAt,T+200);
  d.ingest(provider,event(1,T,T+1000,1.1007,{at:T+180}),'direct-in');
  assert.equal(s.quote,1.1007,'a known source event takes precedence over an unverified receipt-time fallback');
  assert.equal(s.lastQuoteAt,T+180);assert.ok(s.quoteHistory.every(q=>q.ts<=T+180));
 });
}
