// Controlled broker frames for ingestion contracts; not market-accuracy evidence.
export function receivedHistoryInput(Driver,provider='exnova',count=3,mirror=false,now=Math.floor(Date.now()/1000)*1000){
 const driver=new Driver();
 const state=driver.state(provider);state.activeId=1;state.symbol='EUR/USD';state.candleSize=60;
 const prices=[...Array(8).fill(104),104,103,102,100,100.2,100.4,101];
 const transform=p=>1.1+((mirror?220-p:p)-100)*.00001;
 const candles=Array.from({length:count},(_,i)=>{
  const low=i===count-2?100:103;
  return {from:(now-(count-i)*60000)/1000,to:(now-(count-1-i)*60000)/1000,
   open:transform(107),close:transform(106),high:transform(mirror?low:110),low:transform(mirror?110:low)};
 });
 for(const [i,price] of prices.entries())driver.ingest(provider,{name:'quote-generated',msg:{active_id:1,
  price:transform(price),time:(now-(prices.length-1-i)*1000)/1000}},'page-in');
 driver.ingest(provider,{name:'candles',msg:{active_id:1,candles}},'page-in');
 return {now,driver,state,live:driver.liveStatus(provider)};
}
