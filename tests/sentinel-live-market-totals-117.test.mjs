import test from 'node:test';
import assert from 'node:assert/strict';
import {patchMarketTotals} from '../sentinel-trading-lab/agent/worker/market-totals-readout.mjs';
const ids=['market-now','prior-structure','total-of-totals'];
function withPanel(run){
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 const nodes=ids.map(()=>({side:{textContent:'AGUARDAR',style:{color:'white'}},call:{textContent:'CALL —',style:{color:'green'}},put:{textContent:'PUT —',style:{color:'red'}}}));
 const panel={dataset:{provider:'exnova',asset:'EUR/USD OTC',engine:'automatic',duration:'60000',language:'pt',state:'running',readingsAt:'0',neutralColor:'white'},querySelector(selector){const index=ids.findIndex(id=>selector.includes('"'+id+'"'));return index<0?null:{querySelector:s=>s.includes('reading-side')?nodes[index].side:s.includes('reading-call')?nodes[index].call:nodes[index].put}}};
 globalThis.window={};globalThis.document={getElementById:()=>({shadowRoot:{querySelector:()=>panel}})};
 const now=Date.now(),frame={provider:'exnova',asset:'EUR/USD OTC',engine:'automatic',durationMs:60000,language:'pt',state:'running',at:now,quoteAt:now,fresh:true,waitLabel:'AGUARDAR',neutralLabel:'NEUTRO',cards:ids.map((id,i)=>({id,side:i===1?'PUT':'CALL',callPct:i===1?25:75,putPct:i===1?75:25}))};
 try{run({nodes,panel,frame})}finally{globalThis.window=oldWindow;globalThis.document=oldDocument}
}
test('all three totals update from the supplied analysis, including their colors',()=>withPanel(({nodes,frame})=>{
 patchMarketTotals(frame);
 for(let i=0;i<3;i++){assert.equal(nodes[i].side.textContent,i===1?'PUT':'CALL');assert.equal(nodes[i].side.style.color,i===1?'red':'green');assert.equal(nodes[i].call.textContent,i===1?'CALL 25%':'CALL 75%');}
}));
test('a delayed older total or full render cannot roll back the newest total',()=>withPanel(({nodes,panel,frame})=>{
 patchMarketTotals(frame);patchMarketTotals({...frame,at:frame.at-100,cards:[]});assert.equal(nodes[0].side.textContent,'CALL');
 nodes[0].side.textContent='old full render';panel.dataset.readingsAt=String(frame.at-100);
 window.__sentinelApplyMarketTotals();assert.equal(nodes[0].side.textContent,'CALL');
 panel.dataset.readingsAt=String(frame.at+100);nodes[0].side.textContent='new full render';window.__sentinelApplyMarketTotals();assert.equal(nodes[0].side.textContent,'new full render');
}));
test('asset, broker, strategy, duration, language and stopped state stay isolated',()=>withPanel(({nodes,frame})=>{
 for(const replacement of [{asset:'GBP/USD OTC'},{provider:'iq_option'},{engine:'trend'},{durationMs:30000},{language:'en'},{state:'stopped'}]){
  patchMarketTotals({...frame,...replacement});assert.equal(nodes[0].side.textContent,'AGUARDAR');
 }
 patchMarketTotals(frame);assert.equal(nodes[0].side.textContent,'CALL');
}));
test('stale or missing current readings clear old percentages instead of freezing them',()=>withPanel(({nodes,frame})=>{
 patchMarketTotals(frame);patchMarketTotals({...frame,at:frame.at+1,quoteAt:frame.quoteAt-4000});
 for(const n of nodes){assert.equal(n.side.textContent,'AGUARDAR');assert.equal(n.call.textContent,'CALL —');assert.equal(n.put.textContent,'PUT —');}
 patchMarketTotals({...frame,at:frame.at+2,cards:[]});assert.equal(nodes[0].side.textContent,'AGUARDAR');
}));
