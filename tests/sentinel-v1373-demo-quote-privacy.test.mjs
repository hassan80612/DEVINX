import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {eligibleDemoQuote,DemoQuoteRecorder} from
  '../sentinel-trading-lab/agent/worker/demo-quote-recorder.mjs';

const now = Date.UTC(2026,9,11,16,0,0);
const valid={
  provider:'iq_option',adapterMode:'demo',now,
  market:{mode:'demo',quote:1.11999,lastQuoteAt:now-400,
    symbol:'EUR/USD OTC',validatedSymbol:'EUR/USD OTC',
    feedValidated:true,assetValidated:true,marketStatus:'ready',
    balance:1234,session:'PRIVATE_TOKEN',userId:'not_recorded'}
};

test('fail-closed DEMO admission and accurate quote timestamp',()=>{
 const accepted=eligibleDemoQuote(valid);
 assert.deepEqual(accepted,{provider:'iq_option',asset:'EUR/USD OTC',
  ts:now-400,price:1.11999});
 for(const mode of ['real','unknown','',null]){
  assert.equal(eligibleDemoQuote({...valid,market:{...valid.market,mode}}),null);
  assert.equal(eligibleDemoQuote({...valid,adapterMode:mode}),null)
 }
 for(const bad of [
  {feedValidated:false},{assetValidated:false},
  {marketStatus:'switching'},{lastQuoteAt:now-6000},
  {lastQuoteAt:now+20},{quote:0},
  {validatedSymbol:'GBP/USD OTC'},
  {validatedSymbol:''}
 ]) assert.equal(eligibleDemoQuote({...valid,market:{...valid.market,...bad}}),null);
 assert.equal(eligibleDemoQuote({...valid,provider:'unknown'}),null);
});

test('only minimal public market fields are written, duplicate and REAL are ignored',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sentinel-demo-only-'));
 const directory=join(root,'market-history');
 const stopFlag=join(root,'demo-quotes-disabled.flag');
 const recorder=new DemoQuoteRecorder({directory,stopFlag,
   release:{version:'13.4.73',build:'test-local'},clock:()=>now});
 try{
  assert.equal(recorder.observe(valid),true);
  assert.equal(recorder.observe(valid),false);
  assert.equal(recorder.observe({...valid,market:{...valid.market,mode:'real',
    lastQuoteAt:now-200}}),false);
  assert.equal(recorder.observe({...valid,adapterMode:'unknown',
    market:{...valid.market,lastQuoteAt:now-100}}),false);
  await recorder.flush();
  const names=await readdir(directory);
  assert.equal(names.length,1);
  const raw=await readFile(join(directory,names[0]),'utf8');
  const events=raw.trim().split('\n').map(x=>JSON.parse(x));
  assert.equal(events.length,1);
  assert.equal(events[0].type,'market');
  assert.equal(events[0].quoteTs,now-400);
  for(const forbidden of ['balance','session','userId','PRIVATE_TOKEN','real',
    'operational','password','cookie','trades'])
    assert.equal(raw.includes(forbidden),false,'leaked '+forbidden);
  assert.equal(recorder.status().scope,'DEMO_ONLY');
  assert.equal(recorder.status().localOnly,true);
  await writeFile(stopFlag,'disabled');
  assert.equal(recorder.observe({...valid,market:{...valid.market,lastQuoteAt:now-10}}),false);
  assert.equal(recorder.status().enabled,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
