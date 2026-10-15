import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {presentableMarketCards,lightweightDashboard} from '../sentinel-trading-lab/agent/src/core/vnext-market-cards.mjs';

const ids=['market-now','prior-structure','total-of-totals'];
test('three identically keyed presentation cards exist at startup, empty cycle, and new cycle',()=>{
 const empty=presentableMarketCards(null);
 assert.deepEqual(empty.map(x=>x.id),ids);
 assert.ok(empty.every(x=>x.side==='AGUARDAR'&&x.callPct===null&&x.putPct===null));
 const live=presentableMarketCards([
  {id:'market-now',side:'CALL',callPct:64,putPct:36},
  {id:'prior-structure',side:'PUT',callPct:30,putPct:70},
  {id:'total-of-totals',side:'NEUTRO',callPct:50,putPct:50}
 ]);
 assert.deepEqual(live.map(x=>x.id),ids);
 assert.deepEqual(live.map(x=>x.side),['CALL','PUT','NEUTRO']);
 const cleared=presentableMarketCards([]);
 assert.deepEqual(cleared.map(x=>x.id),ids);
 assert.ok(cleared.every(x=>x.side==='AGUARDAR'&&x.callPct===null&&x.putPct===null));
 assert.deepEqual(presentableMarketCards(live).map(x=>x.id),ids);
});
test('unverified and partly missing data never invent signal or win percentages',()=>{
 const [first,second,third]=presentableMarketCards([
   {id:'market-now',side:'CALL',callPct:80,putPct:null},
   {id:'prior-structure',side:'PUT',callPct:40,putPct:60},
   {id:'unknown',side:'CALL',callPct:99,putPct:1}
 ]);
 assert.deepEqual({side:first.side,callPct:first.callPct,putPct:first.putPct},
  {side:'AGUARDAR',callPct:null,putPct:null});
 assert.equal(second.side,'PUT');
 assert.equal(second.callPct,40);
 assert.equal(third.side,'AGUARDAR');
 assert.equal(third.callPct,null);
});
test('the observer and decision engine remain separate; quote-derived indices unchanged',()=>{
 const start=Date.UTC(2026,9,16,10);
 const rows=Array.from({length:100},(_,i)=>({ts:start+i*1000,price:1.2+i*.00001}));
 const obs=lightweightDashboard({quoteHistory:rows,now:rows.at(-1).ts});
 const display=presentableMarketCards(obs.cards);
 for(let i=0;i<3;i++){
  assert.equal(display[i].id,obs.cards[i].id);
  assert.equal(display[i].callPct,obs.cards[i].callPct);
  assert.equal(display[i].putPct,obs.cards[i].putPct);
 }
 // A later empty view MUST NOT carry the old quote or the forecast side.
 assert.ok(presentableMarketCards([]).every(x=>x.side==='AGUARDAR'));
});
test('both PC and phone use the same fixed slot function and no extra decision clock',()=>{
 const pc=readFileSync('sentinel-trading-lab/agent/worker/local-playwright-driver.mjs','utf8');
 const mobile=readFileSync('sentinel-trading-lab/src/components/LiveScenarioCard.tsx','utf8');
 assert.match(pc,/payload\.visualMarketCards=presentableMarketCards\(payload\.vnext\?\.cards\)/);
 assert.match(pc,/\(d\.visualMarketCards\|\|\[\]\)\.map\(c=>/);
 assert.match(mobile,/presentableMarketCards\(s\?\.lastResult\?\.analysis\?\.vnext\?\.cards\)/);
 assert.match(mobile,/m\.quoteFresh/);
});
