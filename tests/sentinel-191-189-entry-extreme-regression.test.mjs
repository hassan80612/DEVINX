import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationRoomRisk} from '../sentinel-trading-lab/agent/src/core/continuation-room-risk.mjs';
const T=1800000000000;
const received=prices=>prices.map((price,i)=>({ts:T-(prices.length-1-i)*1000,receivedAt:T-(prices.length-1-i)*1000,price}));
const resistance=()=>({tolerance:.0002,candleLevelMap:{observedCandles:60,tolerance:.0002,asOf:T-60000,
 levels:[{level:1.0001,low:1.0000,high:1.0002,confirmedPivots:2,resistancePivots:2,
 resistanceRejections:3,supportPivots:0,supportRejections:0}]}});
test('1m continuing impulse near unbroken historical resistance is WAIT, not chased',()=>{
 const quotes=received([.9988,.9989,.999,.9991,.9992,.9993,.9995,.99965,.9998,.99995]);
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:.99995};
 const risk=continuationRoomRisk({candidate,structure:resistance(),quoteHistory:quotes,
  quoteAt:T,now:T,price:.99995,durationMs:60000});
 assert.equal(risk?.kind,'short-horizon-entry-without-clearance-to-opposing-wall',JSON.stringify(risk));
});
test('legitimate breakout above historical resistance remains eligible',()=>{
 const quotes=received([.9988,.999,.9992,.9994,.9996,.9998,1.0001,1.0004,1.00055,1.0007]);
 const candidate={ready:true,side:'CALL',reason:'historical-level-breakout',observedAt:T,entryPrice:1.0007};
 assert.equal(continuationRoomRisk({candidate,structure:resistance(),quoteHistory:quotes,
  quoteAt:T,now:T,price:1.0007,durationMs:60000}),null);
});
test('without an opposing historical level and for 5m, original decision is preserved',()=>{
 const quotes=received([.9988,.9989,.999,.9991,.9992,.9993,.9995,.99965,.9998,.99995]);
 const candidate={ready:true,side:'CALL',reason:'closed-structure-and-live-impulse',observedAt:T,entryPrice:.99995};
 const empty={...resistance(),candleLevelMap:{observedCandles:60,asOf:T-60000,tolerance:.0002,levels:[]}};
 assert.equal(continuationRoomRisk({candidate,structure:empty,quoteHistory:quotes,quoteAt:T,now:T,price:.99995,durationMs:60000}),null);
 assert.equal(continuationRoomRisk({candidate,structure:resistance(),quoteHistory:quotes,quoteAt:T,now:T,price:.99995,durationMs:300000}),null);
});
