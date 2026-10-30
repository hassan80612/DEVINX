import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentQuoteStructureTurn} from '../sentinel-trading-lab/agent/src/core/observed-level-sequence.mjs';
import {stretchedImpulse,reviewEntryPrice} from '../sentinel-trading-lab/agent/src/core/entry-price-timing.mjs';
import {marketReading} from '../sentinel-trading-lab/agent/src/core/market-reading.mjs';
test('a fresh small pivot break cannot renew the already travelled leg from the recorded 170 entry 14',()=>{
 const input=JSON.parse(readFileSync(new URL('./fixtures/sentinel-178-extended-pivot-input.json',import.meta.url)));
 const risk=stretchedImpulse({...input,side:input.candidate.side});assert.ok(risk);
 const proof=currentQuoteStructureTurn({...input,side:input.candidate.side});assert.ok(proof);
 const first=input.quoteHistory.find(q=>q.ts>proof.turnAt&&q.price-proof.pivotPrice>proof.amplitude);
 assert.ok(input.now-first.ts<=1450,'the old generic bypass would call this pivot fresh');
 assert.ok(input.price-proof.pivotPrice<=proof.amplitude+risk.typicalMove*.5);
 const out=reviewEntryPrice(input);assert.equal(out.ready,false);assert.equal(out.side,null);
 assert.equal(out.reason,'extended-move-without-current-entry-confirmation');
 assert.equal(out.entryTiming.kind,'entry-price-already-extended');
 assert.match(marketReading({candidate:out}),/ESTICADA/);
 assert.deepEqual(reviewEntryPrice(input),out,'no state queue or rearming');
});
