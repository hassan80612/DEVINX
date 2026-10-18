import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const input=new URL('../../research-data/dukascopy-eurusd-example.json',import.meta.url),bytes=readFileSync(input);
const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
if(blob!=='7df560b3561aa644e10ea04a39947bb992cdff2d')throw Error('Unexpected external dataset bytes');
const raw=JSON.parse(bytes),byTime=new Map();
for(const q of raw){
 if(!(q.timestamp>0&&q.bidPrice>0&&q.askPrice>=q.bidPrice))throw Error('Invalid source tick');
 byTime.set(q.timestamp,{ts:q.timestamp,price:q.bidPrice,receivedAt:q.timestamp});
}
const quotes=[...byTime.values()].sort((a,b)=>a.ts-b.ts),candles=[],minutes=new Map();
for(const q of quotes){const from=Math.floor(q.ts/60000)*60000;
 let c=minutes.get(from);if(!c){c={from:from/1000,to:from/1000+60,open:q.price,close:q.price,high:q.price,low:q.price,receivedAt:from+60000};minutes.set(from,c);}
 c.close=q.price;c.high=Math.max(c.high,q.price);c.low=Math.min(c.low,q.price);
}
candles.push(...minutes.values());
const metadata={source:'https://github.com/Leo4815162342/dukascopy-node/blob/master/examples/with-tick-data/with-tick-data.output.json',
 gitBlob:blob,sha256:createHash('sha256').update(bytes).digest('hex'),instrument:'EUR/USD',priceSide:'bid',date:'2020-03-30',
 rawTicks:raw.length,distinctTimestamps:quotes.length,sourceLicense:'MIT; Copyright (c) 2022 Leonid Pyrlia',expiryQuotePolicy:'asof-complete-bid-stream',
 limitations:['External Dukascopy Forex data, not IQ Option/Exnova OTC and not the user session.',
 '1m OHLC aggregated from the source ticks, not broker-supplied native candles.',
 'No interpolation or invented ticks; evaluate on actual quoted prices and timestamps.']};
const windows=[2,5,23].map(hour=>({name:'sixth-validation-'+String(hour).padStart(2,'0')+'-utc',from:'2020-03-30T'+String(hour).padStart(2,'0')+':00:00Z',to:'2020-03-30T'+String(hour).padStart(2,'0')+':30:00Z'}));
mkdirSync(new URL('../tests/fixtures/external/',import.meta.url),{recursive:true});
for(const window of windows){
 const from=Date.parse(window.from),to=Date.parse(window.to),bucket=new Map();
 const selected=quotes.filter(q=>q.ts>=from-6300000&&q.ts<=to+31000);
 for(const q of selected)if(q.ts>=from&&q.ts<=to)bucket.set(Math.floor(q.ts/1000),q);
 const result={asset:'EUR/USD',metadata:{kind:'external-market-replay-not-user-session',...metadata,...window},
  quotes:selected,targets:[...bucket.values()],candles:candles.filter(c=>c.to*1000>=from-6000000&&c.to*1000<=to)};
 writeFileSync(new URL('../tests/fixtures/external/dukascopy-eurusd-'+window.name+'.json',import.meta.url),JSON.stringify(result)+'\n');
 console.log(JSON.stringify({name:window.name,quotes:result.quotes.length,targets:result.targets.length,candles:result.candles.length}));
}
writeFileSync(new URL('../reports/sentinel-sixth-external-data-provenance-20261018.json',import.meta.url),JSON.stringify({metadata,windows},null,2)+'\n');
