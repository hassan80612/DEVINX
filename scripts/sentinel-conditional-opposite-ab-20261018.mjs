import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {conditionalOppositeSignal,observedDirectionContext} from '../experiments/conditional-opposite-signal-20261018.mjs';
import {conditionalOppositeRuntime} from '../experiments/conditional-opposite-runtime-20261018.mjs';
import {DemoTradingRuntime} from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import {simulate,metrics} from './sentinel-conflict-choice-ab-20261017.mjs';
import {expiryQuote} from '../experiments/replay-expiry-quote-20261017.mjs';
const root=new URL('../',import.meta.url),json=path=>{
 const file=new URL(path,root);return JSON.parse(existsSync(file)?readFileSync(file):gunzipSync(readFileSync(new URL(path+'.gz',root))));};
const spec=json('reports/sentinel-conditional-opposite-spec-20261018.json');
function fixture(name,video=false){
 const path=video?'tests/fixtures/sentinel-user-video-broker-6dp-20261016.json':
  'tests/fixtures/external/'+(name.startsWith('binance-')?'':'dukascopy-eurusd-')+name+'.json';
 const bytes=readFileSync(new URL(path,root)),data=JSON.parse(bytes);
 return {data:video?{quotes:data.quoteHistory,asset:data.asset,metadata:{name,kind:'known-video-not-independent'}}:data,
  fixtureSha256:createHash('sha256').update(bytes).digest('hex')};
}
if(process.env.SENTINEL_OPPOSITE_FULL==='1'){
 // Verify counterfactual invariance in the real runtime on a fixed selection:
 // weak Forex, directional crypto, weak crypto, and the single known broker video.
 const cases=[['fourth-validation-13-utc',false],['binance-btcusdt-2025-10-17-1500-utc',false],
  ['binance-solusdt-2025-10-19-1500-utc',false],['known-user-video-six-decimal-extraction',true]];
 const c=await conditionalOppositeRuntime(),realNow=Date.now,results=[];
 try{
  for(const [name,video]of cases){
   const {data,fixtureSha256}=fixture(name,video),r=simulate(data,{Runtime:[DemoTradingRuntime,c.DemoTradingRuntime],selectors:[null,null]});
   assert.deepEqual(r.entries[0].map(({side,result,...e})=>e),r.entries[1].map(({side,result,...e})=>e),'inversion changed admission, price or deadline');
   for(let i=0;i<r.entries[0].length;i++){
    const e=r.entries[0][i],history=data.quotes.filter(q=>q.ts>=e.at-300000&&q.ts<=e.at);
    const expected=conditionalOppositeSignal({candidate:{ready:true,side:e.side,entryPrice:e.price,observedAt:e.at},
     quoteHistory:history,quoteAt:e.at,price:e.price,now:e.at,durationMs:30000});
    assert.equal(r.entries[1][i].side,expected.side,'full runtime differs from classified final output');
   }
   results.push({...r,name,fixtureSha256});
  }
 }finally{Date.now=realNow;c.cleanup();}
 writeFileSync(new URL('reports/sentinel-conditional-opposite-runtime-20261018.json',root),JSON.stringify({spec,results},null,2)+'\n');
 console.log(JSON.stringify({fullRuntimeVerified:results.map(r=>({name:r.name,metrics:r.metrics,changed:r.correctedAtSameTime+r.spoiledAtSameTime}))}));
}else{
 const results=[];
 for(const set of ['known','crypto','validation','video']){
  const prior=set==='video'?{results:[json('reports/sentinel-actual-entry-reference-video-20261018.json')]}:
   json('reports/sentinel-actual-entry-reference-ab-20261018-'+set+'.json');
  for(const source of prior.results){
   const name=source.name,{data,fixtureSha256}=fixture(name,set==='video');
   const original=source.entries[0],entries=[];
   for(const e of original){
    const history=data.quotes.filter(q=>q.ts>=e.at-300000&&q.ts<=e.at&&(q.receivedAt??q.ts)<=e.at);
    assert.ok(history.some(q=>q.ts===e.at&&q.price===e.price));
    const args={quoteHistory:history,quoteAt:e.at,price:e.price,now:e.at,durationMs:30000};
    const context=observedDirectionContext(args),candidate=conditionalOppositeSignal({...args,
     candidate:{ready:true,side:e.side,entryPrice:e.price,observedAt:e.at,reason:source.entryReasons[0].find(x=>x.at===e.at)?.reason}});
    // Classifier and transform have returned before any future price is scored.
    const exit=expiryQuote(data.quotes,e.dueAt,data.metadata?.expiryQuotePolicy);
    const result=!exit?'missing':exit.price===e.price?'tie':(exit.price>e.price?'CALL':'PUT')===candidate.side?'win':'loss';
    const flipped=e.side!==candidate.side;
    assert.equal(result,flipped?(e.result==='win'?'loss':e.result==='loss'?'win':e.result):e.result);
    entries.push({...e,side:candidate.side,result,originalSide:e.side,originalResult:e.result,flipped,condition:context.kind});
   }
   const selected=entries.filter(e=>e.flipped),m=metrics(entries);
   results.push({name,set,fixtureSha256,metrics:[metrics(original),m],changed:selected.length,
    corrected:selected.filter(e=>e.originalResult==='loss').length,spoiled:selected.filter(e=>e.originalResult==='win').length,
    selected:[metrics(selected.map(e=>({...e,result:e.originalResult}))),metrics(selected)],
    contexts:Object.fromEntries([...new Set(entries.map(e=>e.condition))].sort().map(k=>{
     const es=entries.filter(e=>e.condition===k);return[k,{count:es.length,changed:es.filter(e=>e.flipped).length,
      metrics:[metrics(es.map(e=>({...e,result:e.originalResult}))),metrics(es)]}];})),entries});
  }
 }
 const aggregate=es=>{const m=metrics(es);delete m.maxLossStreak;return m;};
 const summary=Object.fromEntries(['known','crypto','validation','video'].map(set=>{
  const rows=results.filter(r=>r.set===set),entries=rows.flatMap(r=>r.entries);
  return [set,{windows:rows.length,metrics:[aggregate(entries.map(e=>({...e,result:e.originalResult}))),aggregate(entries)],
   selected:[aggregate(entries.filter(e=>e.flipped).map(e=>({...e,result:e.originalResult}))),aggregate(entries.filter(e=>e.flipped))],
   changed:entries.filter(e=>e.flipped).length,corrected:rows.reduce((s,r)=>s+r.corrected,0),spoiled:rows.reduce((s,r)=>s+r.spoiled,0),
   improved:rows.filter(r=>r.metrics[1].winRate>r.metrics[0].winRate).length,worsened:rows.filter(r=>r.metrics[1].winRate<r.metrics[0].winRate).length,
   worstWindowLossStreak:[0,1].map(i=>Math.max(0,...rows.map(r=>r.metrics[i].maxLossStreak)))}];
 }));
 writeFileSync(new URL('reports/sentinel-conditional-opposite-ab-20261018.json',root),JSON.stringify({spec,summary,results},null,2)+'\n');
 console.log(JSON.stringify({summary},null,2));
}
