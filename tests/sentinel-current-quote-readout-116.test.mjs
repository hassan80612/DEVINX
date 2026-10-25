import test from 'node:test';
import assert from 'node:assert/strict';
import {patchCurrentQuote} from '../sentinel-trading-lab/agent/worker/current-quote-readout.mjs';
test('quote-only refresh rejects old or mismatched frames and preserves other UI state',()=>{
 const originalWindow=globalThis.window,originalDocument=globalThis.document;
 const node={dataset:{provider:'exnova',asset:'EUR/USD OTC',quoteAt:'1000'},textContent:'1.13000'};
 const entry={textContent:'1.13010'},scroll={scrollTop:120};
 globalThis.window={};globalThis.document={getElementById:()=>({shadowRoot:{querySelector:selector=>selector==='[data-sentinel-current-quote]'?node:null}})};
 const send=(price,quoteAt,asset='EUR/USD OTC',provider='exnova')=>patchCurrentQuote({price,quoteAt,asset,provider});
 try{
  send(1.12949,2000);assert.equal(node.textContent,'1.12949');
  send(1.12,1500);assert.equal(node.textContent,'1.12949');
  send(2,3000,'GBP/USD OTC');assert.equal(node.textContent,'1.12949');
  send(2,3000,'EUR/USD OTC','iq_option');assert.equal(node.textContent,'1.12949');
  send(NaN,4000);assert.equal(node.textContent,'1.12949');
  send(1.12955,4000);node.textContent='old full render';window.__sentinelApplyCurrentQuote();
  assert.equal(node.textContent,'1.12955');assert.equal(entry.textContent,'1.13010');assert.equal(scroll.scrollTop,120);
 }finally{globalThis.window=originalWindow;globalThis.document=originalDocument;}
});
