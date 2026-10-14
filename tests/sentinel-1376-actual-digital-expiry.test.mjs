import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBrokerTimingFromText} from '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';
import {selectedFixedBrokerExpiry,futurePriceExitSeconds} from
 '../sentinel-trading-lab/agent/src/core/broker-fixed-expiry-1376.mjs';
import {causalForwardPath} from
 '../sentinel-trading-lab/agent/src/core/causal-interval-forecast-1371.mjs';
import {confirmWindowEntry} from
 '../sentinel-trading-lab/agent/src/core/future-entry-schedule.mjs';
import {evolveOpportunity} from
 '../sentinel-trading-lab/agent/src/core/single-opportunity-window.mjs';
const now=Date.parse('2026-10-14T13:40:39-03:00'),expiresAt=Date.parse('2026-10-14T13:42:00-03:00');
const settings={asset:'EUR/USD',forecastMode:'continuous',engine:'automatic',orderDurationMs:60000};
const brokerTiming={...readBrokerTimingFromText(
 'HORA ATUAL: 14 OUTUBRO, 13:40:39\nEXPIRAÇÃO\n13:42\nTEMPO PARA COMPRA\n00:27',
 {nowMs:now,instrumentKind:'digital'}),symbol:'EUR/USD'};
const quotes=Array.from({length:320},(_,i)=>{
 const t=i-319;
 return {ts:now+t*1000,receivedAt:now+t*1000,price:1.117-i*.000011+Math.sin(i/9)*.000002};
});
test('Exnova photo case: 13:40:39 PUT entry must forecast its 13:42 Digital expiry, not entry+60s',()=>{
 const snap={quoteTs:now,price:quotes.at(-1).price,quoteHistory:quotes,brokerTiming};
 const selected=selectedFixedBrokerExpiry({snap,settings,now});
 assert.equal(selected.verified,true,JSON.stringify(selected));
 assert.equal(selected.expiresAt,expiresAt);
 assert.equal(futurePriceExitSeconds({brokerExpiry:selected,now,leadSeconds:0,holdingSeconds:60}),81);
 assert.equal(futurePriceExitSeconds({brokerExpiry:selected,now,leadSeconds:40,holdingSeconds:60}),81);
 assert.equal(futurePriceExitSeconds({brokerExpiry:selected,now,leadSeconds:78,holdingSeconds:60}),null);
 const outcome=confirmWindowEntry({settings,snap,now,adaptiveHistory:quotes,
   forecastModel:'causal-interval-1371',entryAt:now,brokerExpiresAt:expiresAt});
 const model=causalForwardPath({quoteHistory:quotes,asOf:now,holdingSeconds:60,maxSeconds:120});
 assert.equal(outcome.projectedExitPrice,model.priceAt(81));
 assert.notEqual(outcome.projectedExitPrice,model.priceAt(60),
   'forecast may not silently evaluate the wrong expiration');
 assert.equal(outcome.brokerExpiresAt,expiresAt);
});
test('invalid, stale, OTC, wrong asset or changed expiration are not asserted as broker-verified',()=>{
 const snap={brokerTiming};
 assert.equal(selectedFixedBrokerExpiry({snap,settings,now}).verified,true);
 assert.equal(selectedFixedBrokerExpiry({snap,settings:{...settings,asset:'EUR/USD OTC'},now}).verified,false);
 assert.equal(selectedFixedBrokerExpiry({snap:{brokerTiming:{...brokerTiming,instrumentKind:'binary'}},
   settings,now}).verified,false);
 assert.equal(selectedFixedBrokerExpiry({snap,settings,now:now+10000}).verified,false);
 assert.equal(selectedFixedBrokerExpiry({snap:{brokerTiming:{...brokerTiming,
   selectedExpiration:{kind:'unknown',expiresAt,confidence:0}}},settings,now}).verified,false);
 assert.equal(futurePriceExitSeconds({brokerExpiry:null,now,leadSeconds:2,holdingSeconds:60}),62);
});
test('one immutable entry keeps verified broker expiration without flipping direction',()=>{
 const issuedAt=now-1000;
 const candidate={engineId:'automatic',asset:'EUR/USD',side:'PUT',
   delaySeconds:60,holdingSeconds:60,issuedAt,entryAt:now+3000,
   exitAt:expiresAt,brokerExpiresAt:expiresAt,
   projectedEntryPrice:1.115,projectedExitPrice:1.113};
 const open=evolveOpportunity({settings,candidate,now,quoteAt:now});
 assert.equal(open?.phase,'open');
 assert.equal(open?.exitAt,expiresAt);
 const fired=evolveOpportunity({previous:open,settings,now:now+3000,quoteAt:now+3000,
   confirmation:{side:'PUT',projectedEntryPrice:1.115,projectedExitPrice:1.113}});
 assert.equal(fired.phase,'fired');
 assert.equal(fired.exitAt,expiresAt);
 assert.equal(fired.side,'PUT');
 assert.equal(evolveOpportunity({previous:fired,settings,now:now+4000,quoteAt:now+4000,
   candidate:{...candidate,side:'CALL'}}).phase,'fired');
});
test('the real selected option expiry is delivered via market snapshot, not an unrelated UI clock',()=>{
 const src=readFileSync(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs',import.meta.url),'utf8');
 assert.match(src,/brokerTiming:this\.externalMarket\.brokerTiming\|\|null/);
 assert.match(src,/brokerExpiresAt:currentWindow\.brokerExpiresAt\|\|null/);
});
