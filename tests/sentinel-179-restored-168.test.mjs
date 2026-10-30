import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../sentinel-trading-lab/agent/',import.meta.url);
const reference=JSON.parse(readFileSync(new URL('./fixtures/sentinel-179-published-168-source.json',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const presentation=new Set(['src/core/market-reading.mjs','src/core/ui-texts.mjs']);
test('all published 168 source is preserved except the scoped candidate wall review',()=>{
 assert.equal(reference.payloadSha256,'5033d8bbfb1e6f1637da989068ee57deeb565419495f222821a7adee37769224');
 assert.equal(Object.keys(reference.files).length,92);
 for(const [name,expected] of Object.entries(reference.files)){
  if(presentation.has(name))continue;
  let actual=readFileSync(new URL(name,root));
  if(name==='src/core/continuation-room-risk.mjs'){
   assert.equal(sha(actual),'2c6166c786247bf8880207e412bad0188028081c78b06f6676a7403e63194ef2','only the reviewed candidate file is allowed');continue;
  }
  if(name==='src/core/runtime.mjs'){
   const text=actual.toString(),stamp='observedAt:eligible.observedAt,quoteAt:snap.quoteTs,strength:eligible.strength,';
   assert.equal(text.split(stamp).length,2,'only one presentation quote timestamp is added');
   actual=Buffer.from(text.replace(stamp,'observedAt:eligible.observedAt,strength:eligible.strength,'));
  }
  assert.equal(sha(actual),expected,name);
 }
});
test('later candidate modules are removed and the source set contains no replacement decision path',()=>{
 const collect=(url,prefix='')=>readdirSync(url,{withFileTypes:true}).flatMap(e=>e.isDirectory()?
  collect(new URL(e.name+'/',url),prefix+e.name+'/'):[prefix+e.name]);
 assert.deepEqual(collect(new URL('src/',root)).map(x=>'src/'+x).sort(),Object.keys(reference.files).sort());
 for(const name of ['current-entry-context','expiry-entry-position','forming-candle-continuation'])
  assert.equal(existsSync(new URL('src/core/'+name+'.mjs',root)),false);
});
test('168 quote freshness and 5m reversal-only admission are restored without extra policy',()=>{
 const raw=readFileSync(new URL('src/core/runtime.mjs',root),'utf8');
 assert.match(raw,/Number\(settings\.orderDurationMs\)<=30000\?1450:\s*Number\(settings\.orderDurationMs\)<=60000\?1950:2500/);
 const engine=readFileSync(new URL('src/core/now-opportunity-engine.mjs',root),'utf8');
 assert.doesNotMatch(engine,/formingCandleContinuation|currentEntryContextRisk|ownVerifiedFastReversal/);
 assert.match(engine,/fiveMinuteReversalOnly/);
});
test('the expiry detector remains telemetry only for every bot click',()=>{
 const raw=readFileSync(new URL('worker/broker-ui-executor.mjs',root),'utf8');
 assert.match(raw,/observeNativeExpiryForClick/);
 assert.doesNotMatch(raw,/inspectNativeExpiryBeforeClick|expiry-not-synchronized/);
});
