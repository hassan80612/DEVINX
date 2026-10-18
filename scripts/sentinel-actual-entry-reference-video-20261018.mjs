import {readFileSync,writeFileSync} from 'node:fs';
import {simulate} from './sentinel-conflict-choice-ab-20261017.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {actualEntryReferenceRuntime} from '../experiments/actual-entry-reference-runtime-20261018.mjs';
const f=JSON.parse(readFileSync(new URL('../tests/fixtures/sentinel-user-video-broker-6dp-20261016.json',import.meta.url)));
const c=await actualEntryReferenceRuntime(),realNow=Date.now;
try {
 const result=simulate({quotes:f.quoteHistory,asset:f.asset,metadata:{kind:'previously-inspected-video-not-independent-validation',
  name:'known-user-video-six-decimal-extraction'}},{Runtime:[DemoTradingRuntime,c.DemoTradingRuntime],selectors:[null,null]});
 writeFileSync(new URL('../reports/sentinel-actual-entry-reference-video-20261018.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
}finally{Date.now=realNow;c.cleanup();}
