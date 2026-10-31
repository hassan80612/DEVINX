import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {advanceNowOpportunity} from '../sentinel-trading-lab/agent/src/core/now-opportunity-engine.mjs';
const ds=JSON.parse(readFileSync(new URL('./fixtures/sentinel-182-missed-reaction.json',import.meta.url)));
const candles=d=>d.marketReplay.candles.map(([from,to,open,high,low,close,volume])=>({from,to,open,high,low,close,volume}));
const quotes=d=>d.marketReplay.quotes.map(([ts,price,receivedAt])=>({ts,price,receivedAt}));
function runtime(prior){const rt=new DemoTradingRuntime({enableVNext:true,forecastModel:'short-probability-v1',precisionProfile:'horizon-balanced-v148'});rt.patchSettings({engine:prior.engine,asset:prior.asset,orderDurationMs:prior.durationMs});rt.vnextWindowState=advanceNowOpportunity({candidate:{ready:true,side:prior.side,observedAt:prior.snapshotQuoteAt,entryPrice:prior.snapshotQuote},now:prior.signalAt,quoteAt:prior.snapshotQuoteAt,asset:prior.asset,provider:prior.provider,engineId:prior.engine,durationMs:prior.durationMs});return rt;}
function tick(rt,d,cs,q,now,rows){return rt._signalValidationGate({analysis:{},settings:rt.settings,now,snap:{provider:d.provider,price:q.price,quoteTs:q.ts,quoteHistory:rows,candles:cs,historicalCandlesVerified:true,payout:null}}).analysis.vnext;}
test('actual shared runtime remembers a qualified PUT during a held CALL and declines its later worse-priced renewal',()=>{
 const previous=ds['4'],d=ds['5'],rt=runtime(previous),rows=quotes(d),q=rows.find(q=>q.ts===1793334419000),latency=d.signalAt-d.snapshotQuoteAt;
 const before=tick(rt,d,candles(previous),q,q.ts+latency,rows.filter(x=>x.ts<=q.ts));
 assert.equal(before.nowObservation.ready,true);assert.equal(before.nowObservation.side,'PUT');assert.equal(before.futureEntryAnchor.side,'CALL','existing operation is immutable');
 const after=tick(rt,d,candles(d),rows.at(-1),d.signalAt,rows);
 assert.equal(after.nowObservation.reason,'same-reaction-after-better-missed-price');assert.equal(after.futureEntryAnchor,null);assert.equal(after.nowObservation.marketReading,'REVERSÃO JÁ AVANÇOU · PUT');
});
test('a later, better-priced CALL after a new reaction remains eligible without a timed wait',()=>{
 const previous=ds['5'],d=ds['6'],rt=runtime(previous),rows=quotes(d),q=rows.find(q=>q.ts===1793334467000),latency=d.signalAt-d.snapshotQuoteAt;
 tick(rt,d,candles(previous),q,q.ts+latency,rows.filter(x=>x.ts<=q.ts));
 const after=tick(rt,d,candles(d),rows.at(-1),d.signalAt,rows);assert.equal(after.futureEntryAnchor?.phase,'fired');assert.equal(after.futureEntryAnchor.side,'CALL');assert.equal(after.futureEntryAnchor.entryPrice,d.snapshotQuote);
});
