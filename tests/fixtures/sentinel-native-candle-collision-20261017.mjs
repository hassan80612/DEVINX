import {LocalPlaywrightDriver} from '../../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';
import {runtimeMarketFromLive} from '../../sentinel-trading-lab/agent/worker/runtime-market.mjs';
export const CANDLE_T=1792250040000;
export const candlePrice=t=>1.1+.0003*Math.sin(t/121)+.0001*Math.sin(t/19);
export function nativeCandleFixture(provider='iq_option'){
 const driver=new LocalPlaywrightDriver(),state=driver.state(provider),now=Date.now;
 const small=[];
 for(let t=-6000;t<0;t+=60){const ps=Array.from({length:61},(_,i)=>candlePrice(t+i));
  small.push({from:(CANDLE_T+t*1000)/1000,to:(CANDLE_T+(t+60)*1000)/1000,
   open:ps[0],close:ps.at(-1),high:Math.max(...ps),low:Math.min(...ps)});}
 const large=[];
 for(let i=0;i<small.length;i+=5){const cs=small.slice(i,i+5);large.push({from:cs[0].from,to:cs.at(-1).to,
  open:cs[0].open,close:cs.at(-1).close,high:Math.max(...cs.map(c=>c.high)),low:Math.min(...cs.map(c=>c.low))});}
 state.activeId=1;state.candleActiveId=1;state.symbol='EUR/USD';state.quote=candlePrice(0);state.lastQuoteAt=CANDLE_T;
 state.quoteHistory=Array.from({length:181},(_,i)=>({ts:CANDLE_T+(i-180)*1000,price:candlePrice(i-180),receivedAt:CANDLE_T+(i-180)*1000}));
 try{
  Date.now=()=>CANDLE_T;
  driver.ingest(provider,{name:'candles',msg:{active_id:1,candles:small}},'direct-in');
  driver.ingest(provider,{name:'candles',msg:{active_id:1,candles:large}},'direct-in');
  const live=driver.liveStatus(provider);
  return {driver,state,small,large,live,market:runtimeMarketFromLive(provider,live,'EUR/USD')};
 }finally{Date.now=now;}
}
