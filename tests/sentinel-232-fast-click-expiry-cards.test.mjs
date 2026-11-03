import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {inspectTradeControls} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
const provider='exnova',activeId=234,symbol='EUR/GBP OTC';
const make=()=>{let concurrent=0,max=0,scans=0;
 const frames=Array.from({length:4},(_,i)=>({
  evaluate:async fn=>{
   assert.equal(fn,inspectTradeControls,'discovery may inspect but never click');
   concurrent++;max=Math.max(max,concurrent);scans++;
   await new Promise(resolve=>setTimeout(resolve,20));
   concurrent--;return i===2?{callSelector:'#call',putSelector:'#put'}:{error:'not here'};
  }
 }));
 const page={frames:()=>frames,isClosed:()=>false};
 const driver={sessions:new Map([[provider,{page}]]),state:()=>({activeId,symbol})};
 return {executor:new BrokerUiExecutor(driver),frames,page,getConcurrent:()=>max,getScans:()=>scans};
};
test('232: scan separate broker iframes in parallel, selecting exactly one CALL/PUT pair',async()=>{
 const m=make(),result=await m.executor.controls(provider);
 assert.ok(m.getConcurrent()>1,'scan must no longer serialize unrelated slow iframes');
 assert.equal(m.getScans(),4);
 assert.strictEqual(result.frame,m.frames[2]);
 assert.equal(result.callSelector,'#call');
 assert.equal(result.putSelector,'#put');
});
test('232: cached live controls older than 15s do not incur full-frame rescans',async()=>{
 const m=make();
 await m.executor.controls(provider);
 let validate=0;
 m.frames[2].evaluate=async()=>{validate++;return true;};
 const cached=m.executor.cachedHtmlControls.get(provider);
 cached.at=Date.now()-60_000;
 const r=await m.executor.controls(provider);
 assert.strictEqual(r.frame,m.frames[2]);
 assert.equal(validate,1,'revalidate current buttons on live page');
 assert.equal(m.getScans(),4,'no full rescan after arbitrary timer');
});
test('232: changed buttons are rejected and rediscovered; duplicate panels fail closed',async()=>{
 const m=make();await m.executor.controls(provider);
 m.frames[2].evaluate=async()=>false;
 let activity=0;
 m.frames[0].evaluate=async fn=>{activity++;return {callSelector:'#new-call',putSelector:'#new-put'}};
 m.frames[1].evaluate=async fn=>{activity++;return {callSelector:'#other-call',putSelector:'#other-put'}};
 await assert.rejects(m.executor.controls(provider),/Mais de um painel/);
 assert.ok(activity>=2);
});
test('232: old inherited 30s page receipts are not accepted as user-selected 30s',()=>{
 const driver=readFileSync(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs',import.meta.url),'utf8');
 const keeper=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 assert.match(driver,/choice\.value!==30000\|\|\(choice\.explicitDefault===true&&choice\.selectedAt>0\)/);
 assert.match(keeper,/source==='manual'\|\|source==='analyst'\|\|explicitDefault/);
 assert.match(keeper,/if\(ms===30000&&!explicit&&preferredMs>30000&&!explicitDefault\)return true/);
 assert.match(keeper,/if\(ms===30000&&!explicit&&Number\(localStorage\.getItem\(key\)\)>30000\)return true/);
});
test('232: all first-click real price, expiry and broker confirmation guards are preserved',()=>{
 const base=new URL('../sentinel-trading-lab/agent/worker/',import.meta.url);
 const executor=readFileSync(new URL('signal-executor.mjs',base),'utf8');
 const click=readFileSync(new URL('broker-ui-executor.mjs',base),'utf8');
 assert.doesNotMatch(executor,/liveEntryQuoteReview\(\{signal:queued,context:current,now\}\)/);
 assert.doesNotMatch(executor,/reviewDirectionBeforeClick\(\{signal:queued,context:current,now\}\)/);
 assert.match(click,/verifyBrokerExpiryForOrder\(/);
 assert.match(click,/if\(!order\.isValid\(\)\)/);
 assert.match(click,/const timeout=clickTimeout\(\);before\(\);await c\.frame\.locator/);
});
test('232: retain historical market readings only within the existing 30s safety window',()=>{
 const body=readFileSync(new URL('../sentinel-trading-lab/agent/worker/market-totals-readout.mjs',import.meta.url),'utf8');
 assert.match(body,/saved\?\.contextKey===contextKey/);
 assert.match(body,/Date\.now\(\)-Number\(saved\.at\)<=30000/);
 assert.match(body,/old\?'ÚLTIMA LEITURA · '/);
 assert.match(body,/const allValid=ids\.every\(id=>valid\(known\(id\)\)\)/);
});
