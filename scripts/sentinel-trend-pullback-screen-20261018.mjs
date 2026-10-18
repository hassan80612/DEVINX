import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {qualifyTrendPullback,trendPullbackContext} from '../experiments/trend-pullback-entry-20261018.mjs';
const root=new URL('../',import.meta.url),read=p=>{const f=new URL(p,root);return JSON.parse(existsSync(f)?readFileSync(f):gunzipSync(readFileSync(new URL(p+'.gz',root))));};
const spec=read('reports/sentinel-trend-pullback-entry-spec-20261018.json'),results=[];
for(const set of ['known','crypto','validation','video']){
 const sources=set==='video'?[read('reports/sentinel-actual-entry-reference-video-20261018.json')]:read('reports/sentinel-actual-entry-reference-ab-20261018-'+set+'.json').results;
 for(const s of sources){
  const name=s.name,path=set==='video'?'tests/fixtures/sentinel-user-video-broker-6dp-20261016.json':
   'tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json',data=read(path),all=data.quotes??data.quoteHistory;
  const entries=s.entries[0].map(e=>{
   const args={quoteHistory:all.filter(q=>q.ts>=e.at-180000&&q.ts<=e.at),quoteAt:e.at,price:e.price,now:e.at,durationMs:30000};
   const context=trendPullbackContext(args),out=qualifyTrendPullback({...args,candidate:{ready:true,side:e.side,entryPrice:e.price,observedAt:e.at}});
   return {...e,withheld:!out.ready,context};
  });results.push({set,name,entries});
 }
}
const summary=Object.fromEntries(['known','crypto','validation','video'].map(set=>{
 const es=results.filter(r=>r.set===set).flatMap(r=>r.entries),xs=es.filter(e=>e.withheld);
 return[set,{entries:es.length,identifiedTrend:es.filter(e=>e.context.identified).length,withheld:xs.length,
  withheldWins:xs.filter(e=>e.result==='win').length,withheldLosses:xs.filter(e=>e.result==='loss').length,
  withheldTies:xs.filter(e=>e.result==='tie').length,withheldMissing:xs.filter(e=>e.result==='missing').length}];
}));
const developmentPass=['known','crypto','validation'].every(k=>summary[k].withheldLosses>summary[k].withheldWins);
writeFileSync(new URL('reports/sentinel-trend-pullback-screen-20261018.json',root),JSON.stringify({spec,developmentPass,summary,results},null,2)+'\n');
console.log(JSON.stringify({developmentPass,summary},null,2));
