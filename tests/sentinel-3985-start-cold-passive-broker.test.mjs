import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {runtimeMarketFromLive} from '../sentinel-trading-lab/agent/worker/runtime-market.mjs';
import {LocalPlaywrightDriver} from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

const worker=readFileSync(new URL('../sentinel-trading-lab/agent/worker/index.mjs',import.meta.url),'utf8');
const start=worker.indexOf('function chooseLive(){');
const end=worker.indexOf('\nfunction syncRuntimeMarket(){',start);
assert.ok(start>=0&&end>start);
function choose({driver,brokers,active=null}){
  let activeProvider=active;
  const source=worker.slice(start,end);
  const chooseLive=new Function('driver','brokers','getActive','setActive',
    source.replace(/\bactiveProvider\b/g,'getActive()')
          .replace(/if\(getActive\(\)!==k\)getActive\(\)=k;/,
                   'if(getActive()!==k)setActive(k);')+
    '\nreturn chooseLive;')(driver,brokers,()=>activeProvider,v=>{activeProvider=v});
  return chooseLive();
}
for(const provider of ['iq_option','exnova']){
 test(provider+': START recognizes authenticated native chart even before balance or price',async()=>{
  const d=new LocalPlaywrightDriver({dataDir:'unused-analyst-cold-start'});
  const st=d.state(provider);
  d.sessions.set(provider,{page:{isClosed:()=>false}});
  d.last.set(provider,{provider,open:true,sessionPresent:true,updatedAt:new Date().toISOString()});
  st.symbol='EUR/USD OTC';st.activeId=76;
  const brokers={iq_option:{connected:false},exnova:{connected:false}};
  brokers[provider].connected=true;
  const current=choose({driver:d,brokers});
  assert.equal(current?.k,provider);
  assert.equal(current.m.balance,null);
  assert.equal(current.m.quote,null);
  assert.equal(current.m.candles.length,0);
  const runtime=new DemoTradingRuntime({enableVNext:true});
  runtime.setExternalMarket(runtimeMarketFromLive(provider,current.m,current.m.symbol));
  assert.equal(runtime._startBlockReason(),null);
  await runtime.start('overlay');
  assert.equal(runtime.stateName,'running');
  const snap=runtime._marketSnapshot();
  assert.equal(snap.waitingLive,true);
  assert.equal(snap.feedValidated,false,'never blindly signal without market data');
 });
 test(provider+': disconnected page never becomes active only because balance is cached',()=>{
  const d=new LocalPlaywrightDriver({dataDir:'unused-analyst-cold-start'});
  d.last.set(provider,{provider,open:false,updatedAt:new Date().toISOString()});
  const brokers={iq_option:{connected:false},exnova:{connected:false}};
  brokers[provider].connected=true;
  d.state(provider).balance=50;
  assert.equal(choose({driver:d,brokers}),null);
 });
}
