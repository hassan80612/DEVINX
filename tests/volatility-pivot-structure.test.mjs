import {test} from 'node:test';import assert from 'node:assert/strict';
import {VolatilityPivotStructure} from '../experiments/volatility-pivot-structure.mjs';
const T=1800000000000;
const series=()=>Array.from({length:900},(_,i)=>({ts:T+i*1000,price:100+2*Math.sin(i/12)+.2*Math.sin(i/2)}));
function run(qs){const m=new VolatilityPivotStructure(),events=[];for(const q of qs){const e=m.observe({quote:q,now:q.ts});if(e)events.push(e);}return {m,events};}
test('confirmation and observed structure break own the entry, never the earlier extreme',()=>{
 const {events}=run(series());assert.ok(events.length>3);for(const e of events){assert.ok(e.knownAt>=e.pivot.confirmedAt);assert.ok(e.pivot.confirmedAt>e.pivot.at);assert.equal(e.decisionAt,e.quoteAt);assert.equal(e.observedAt,e.quoteAt);assert.ok(e.pivot.neckline.confirmedAt<=e.pivot.at);assert.ok((e.side==='CALL'?1:-1)*(e.entryPrice-e.pivot.neckline.price)>0);}
});
test('future input and late receipt cannot alter current pivots or create a call',()=>{
 const m=new VolatilityPivotStructure();for(const q of series().slice(0,180))m.observe({quote:q,now:q.ts});const s=JSON.stringify(m),now=T+179000;
 assert.equal(m.observe({quote:{ts:now+1000,price:1},now}),null);assert.equal(m.observe({quote:{ts:now,price:1,receivedAt:now+1000},now}),null);assert.equal(JSON.stringify(m),s);
});
test('closed minor bars prevent a later intrasecond quote from invalidating a claimed confirmation',()=>{
 const m=new VolatilityPivotStructure();for(const [i,p] of [1,2,5,2,1].entries())m.observe({quote:{ts:T+i*1000,price:p},now:T+i*1000});assert.equal(m.lastHigh,null);m.observe({quote:{ts:T+4500,price:100},now:T+4500});m.observe({quote:{ts:T+5000,price:1},now:T+5000});assert.equal(m.lastHigh,null);
});
test('confirmed pivot records are immutable under a longer future prefix',()=>{
 const m=new VolatilityPivotStructure(),qs=series();for(const q of qs.slice(0,400))m.observe({quote:q,now:q.ts});const old=structuredClone(m.pivots);for(const q of qs.slice(400,500))m.observe({quote:q,now:q.ts});for(const p of old)assert.deepEqual(m.pivots.find(x=>x.at===p.at&&x.type===p.type),p);
});
test('mirrored geometry reverses CALL/PUT at identical observed times',()=>{
 const qs=series(),a=run(qs).events,b=run(qs.map(q=>({...q,price:200-q.price}))).events;assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){assert.equal(a[i].knownAt,b[i].knownAt);assert.notEqual(a[i].side,b[i].side);}
});
test('ATR adaptation preserves signals when the price scale changes',()=>{
 const qs=series(),a=run(qs).events,b=run(qs.map(q=>({...q,price:q.price*100}))).events;assert.deepEqual(a.map(e=>[e.knownAt,e.side]),b.map(e=>[e.knownAt,e.side]));
});
test('missing observations and changed assets cannot reuse the previous swing',()=>{
 const {m}=run(series().slice(0,200));assert.ok(m.atr>0);assert.equal(m.observe({context:'another-asset',quote:{ts:T+200000,price:100},now:T+200000}),null);assert.equal(m.atr,null);assert.equal(m.pivots.length,0);for(const q of series().slice(201,400))m.observe({context:'another-asset',quote:q,now:q.ts});assert.ok(m.atr>0);assert.equal(m.observe({context:'another-asset',quote:{ts:T+410000,price:100},now:T+410000}),null);assert.equal(m.atr,null);
});
test('each pivot emits at most one signal and memory stays bounded',()=>{
 const {m,events}=run(series());assert.equal(new Set(events.map(e=>e.id)).size,events.length);assert.ok(m.ranges.length<=14&&m.minor.length<=5&&m.pivots.length<=64&&m.seen.size<=128);const last=series().at(-1);assert.equal(m.observe({quote:last,now:last.ts}),null);
});
test('a structural break observed between evaluations is admitted only at a current evaluation',()=>{
 const qs=series(),first=run(qs).events[0],m=new VolatilityPivotStructure();
 for(const q of qs.filter(q=>q.ts<first.quoteAt))m.observe({quote:q,now:q.ts});
 const q=qs.find(q=>q.ts===first.quoteAt);assert.equal(m.observe({quote:q,now:q.ts,emit:false}),null);
 assert.equal(m.seen.size,0);assert.ok(m.pending);
 const now=q.ts+1000,e=m.observe({quote:{ts:now,price:q.price},now});
 assert.ok(e);assert.equal(e.decisionAt,now);assert.equal(e.entryPrice,q.price);
});
