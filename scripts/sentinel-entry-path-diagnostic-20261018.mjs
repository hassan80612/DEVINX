import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
const root=new URL('../',import.meta.url),read=p=>{const f=new URL(p,root);return JSON.parse(existsSync(f)?readFileSync(f):gunzipSync(readFileSync(new URL(p+'.gz',root))));};
const results=[];
for(const set of ['known','crypto','validation','video']){
 const sources=set==='video'?[read('reports/sentinel-actual-entry-reference-video-20261018.json')]:read('reports/sentinel-actual-entry-reference-ab-20261018-'+set+'.json').results;
 for(const source of sources){
  const name=source.name,file=set==='video'?'tests/fixtures/sentinel-user-video-broker-6dp-20261016.json':
   'tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json';
  const bytes=readFileSync(new URL(file,root)),data=JSON.parse(bytes),quotes=data.quotes??data.quoteHistory;
  const entries=source.entries[0].map(e=>{
   const sign=e.side==='CALL'?1:-1,path=quotes.filter(q=>q.ts>e.at&&q.ts<=e.dueAt);
   const route=source.entryReasons[0].find(r=>r.at===e.at)?.reason;
   const horizons=Object.fromEntries([2,5,10,15,20,30].map(h=>{
    const p=expiryQuote(quotes,e.at+h*1000,data.metadata?.expiryQuotePolicy),move=p?sign*(p.price-e.price):null;
    return[h,move===null?'missing':move===0?'tie':move>0?'favorable':'adverse'];
   }));
   const anyFavorable=path.some(q=>sign*(q.price-e.price)>0),anyAdverse=path.some(q=>sign*(q.price-e.price)<0);
   return{...e,route,horizons,anyFavorable,anyAdverse};
  });
  results.push({set,name,fixtureSha256:createHash('sha256').update(bytes).digest('hex'),entries});
 }
}
const metrics=entries=>{
 const loss=entries.filter(e=>e.result==='loss'),win=entries.filter(e=>e.result==='win');
 return {entries:entries.length,win:win.length,loss:loss.length,
  lossesNeverFavorable:loss.filter(e=>!e.anyFavorable).length,
  lossesFavorableAt5s:loss.filter(e=>e.horizons[5]==='favorable').length,
  lossesFavorableAt15s:loss.filter(e=>e.horizons[15]==='favorable').length,
  winsAdverseAt5s:win.filter(e=>e.horizons[5]==='adverse').length,
  winsAdverseAt15s:win.filter(e=>e.horizons[15]==='adverse').length,
  horizon: Object.fromEntries([2,5,10,15,20,30].map(h=>[h,Object.fromEntries(['favorable','adverse','tie','missing'].map(k=>[k,entries.filter(e=>e.horizons[h]===k).length]))]))};
};
const summary=Object.fromEntries(['known','crypto','validation','video'].map(set=>{
 const entries=results.filter(r=>r.set===set).flatMap(r=>r.entries);
 return[set,{...metrics(entries),routes:Object.fromEntries([...new Set(entries.map(e=>e.route))].sort().map(k=>[k,metrics(entries.filter(e=>e.route===k))]))}];
}));
writeFileSync(new URL('reports/sentinel-entry-path-diagnostic-20261018.json',root),JSON.stringify({method:'Retrospective path diagnosis on original entries only; no future prices enter the released decisions. All data already known. Quote outcomes are not broker settlements.',summary,results},null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).map(([k,{routes,...s}])=>[k,s])),null,2));
