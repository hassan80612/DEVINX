import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
const make=(ms,count=3,span=1000,validated=true)=>{
 const now=Date.now();
 const rt=new DemoTradingRuntime({enableVNext:true});
 rt.patchSettings({engine:'automatic',orderDurationMs:ms},'test-230');
 rt.setExternalMarket({provider:'exnova',symbol:'EUR/USD OTC',quote:1.10,
  quoteTs:now,quoteFeedValidated:validated,historicalCandlesVerified:true,
  quoteHistory:Array.from({length:count},(_,i)=>({
   ts:now-span+(count===1?span:i*span/(count-1)),
   price:i===count-1?1.10:1.10001+(i*.000001),receivedAt:now-span
  })),
  candles:[]});
 return rt._marketSnapshot();
};
test('230: 30s 1m 5m analysis starts after three real quotes over one second, not fixed 14s',()=>{
 for(const ms of [30000,60000,300000]){
  const snapshot=make(ms,3,1000,true);
  assert.equal(snapshot.waitingLive,false,ms+' ready');
  assert.equal(snapshot.quoteHistory.length,3);
 }
});
test('230: missing/one-tick/unverified broker input still cannot appear ready',()=>{
 for(const ms of [30000,60000,300000]){
  assert.equal(make(ms,1,1000,true).waitingLive,true);
  assert.equal(make(ms,2,1000,true).waitingLive,true);
  assert.equal(make(ms,3,1000,false).waitingLive,true);
 }
});
test('230: no made-up direction when historical proof is absent',()=>{
 const read=marketReading({phase:'insufficient',candidate:{reason:'pending-history'}});
 assert.equal(read,'OBSERVANDO PREÇO ATUAL');
 assert.doesNotMatch(read,/AGUARDANDO HISTÓRICO SUFICIENTE/);
});
test('240: primary EXE restores the working 239 direct GitHub download method',()=>{
 const root=new URL('../sentinel-trading-lab/',import.meta.url);
 const page=readFileSync(new URL('src/app/console/page.tsx',root),'utf8');
 assert.ok(page.includes("const AGENT_DOWNLOAD_URL=`https://raw.githubusercontent.com/hassan80612/DEVINX/refs/heads/fix/sentinel-243-active-spike-regime-20261103/sentinel-trading-lab/public/downloads/Sentinel-Agent-${encodeURIComponent(AVAILABLE_AGENT_VERSION)}.exe`"));
 assert.doesNotMatch(page,/const AGENT_DOWNLOAD_URL=`\/downloads\//);
 assert.equal((page.match(/href=\{AGENT_DOWNLOAD_URL\} download=\{/g)||[]).length,3);
});
test('230: expiry selector and executor are unchanged',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(src,/const historyReady=this\.settings\.engine\?quotes\.length>=3&&quoteSpan>=500/);
 const keeper=readFileSync(new URL('../sentinel-trading-lab/agent/worker/broker-native-expiry-keeper.mjs',import.meta.url),'utf8');
 assert.match(keeper,/defaultRollback=current===30000&&preferredMs!==30000/);
});
