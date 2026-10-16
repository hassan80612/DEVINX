import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const css=await readFile(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8');
const card=await readFile(new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),'utf8');

test('floating landscape browsers prioritize the signed PC decision and timer before controls',()=>{
 const i=css.indexOf('/* Small Android floating browser windows');
 assert.ok(i>0);
 const rules=css.slice(i);
 assert.match(rules, /@media \(max-width:760px\) and \(max-height:600px\)/);
 assert.match(rules, /\.liveScenario > \.vnextFutureReceipt,/);
 assert.match(rules, /order:-2/);
 assert.match(rules, /\.liveScenario > \.vnextEngineToolbar,/);
 assert.match(rules, /order:5/);
 assert.match(rules, /\.vnextEngineToolbar label:first-child > small/);
 assert.match(rules, /display:none!important/);
 assert.match(rules, /\.liveScenarioCompact > \.mobileCurrentQuoteOnly/);
 assert.doesNotMatch(rules, /display:none[^;]*vnextTargetCountdown/);
});
test('no separate floating analysis engine or countdown is introduced',()=>{
 assert.match(card, /pcAuthoritativeWindow\(/);
 assert.match(card, /pcClockNow\(/);
 assert.match(card, /\{forecastReceipt\}/);
 assert.match(card, /\{engineSettings\}/);
});
