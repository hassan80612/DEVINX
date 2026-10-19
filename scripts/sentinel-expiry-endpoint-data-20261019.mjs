import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {endpointFeatures,ENDPOINT_FEATURE_NAMES} from '../experiments/expiry-endpoint-features-20261019.mjs';
const read=p=>{const u=new URL('../'+p,import.meta.url);return JSON.parse(existsSync(u)?readFileSync(u):gunzipSync(readFileSync(new URL('../'+p+'.gz',import.meta.url))));};
const train=read('reports/sentinel-accuracy-repair-binance-data-20261018.json').windows;
const rows=[];
for(const w of train){
 const d=read('tests/fixtures/external/'+w.name+'.json'),q=d.quotes,byTime=new Map(q.map(x=>[x.ts,x]));
 for(let i=180;i+30<q.length;i+=30){const current=q[i],end=byTime.get(current.ts+30000);if(!end||end.price===current.price)continue;
  const features=endpointFeatures({quoteHistory:q.slice(Math.max(0,i-184),i+1),quoteAt:current.ts,price:current.price});if(features)rows.push({window:w.name,at:current.ts,dueAt:end.ts,features,y:end.price>current.price?1:0});
 }
}
const sets=[['forex','sentinel-final-conflict-audit-20261018-known.json'],['crypto-screen','sentinel-actual-entry-reference-ab-20261018-validation.json']];
const screen=[];
for(const [set,file] of sets)for(const w of read('reports/'+file).results){
 const name=w.name,d=read('tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json');
 const entries=w.entries[0].map(e=>{const q=d.quotes.filter(q=>q.ts<=e.at&&q.ts>=e.at-184000);const last=q.at(-1);return {...e,features:endpointFeatures({quoteHistory:q,quoteAt:last.ts,price:last.price,now:e.at})};});
 screen.push({set,name,entries});
}
writeFileSync(new URL('../research/expiry-endpoint-training-20261019.json',import.meta.url),JSON.stringify({featureNames:ENDPOINT_FEATURE_NAMES,rows}));
writeFileSync(new URL('../research/expiry-endpoint-screen-input-20261019.json',import.meta.url),JSON.stringify({screen}));
console.log(JSON.stringify({trainingWindows:train.length,trainingExamples:rows.length,screenWindows:screen.length,features:ENDPOINT_FEATURE_NAMES.length}));
