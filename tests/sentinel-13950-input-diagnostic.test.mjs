import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInputDiagnostic} from '../sentinel-trading-lab/agent/worker/broker-input-diagnostic.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {executorPanel} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
test('input diagnosis allows structural flags and counts, never values or key content',()=>{
 const secret='do-not-transmit-this';const d=normalizeInputDiagnostic({format:'sentinel-input-diagnostic-v1',active:true,documentFocused:true,canvasCount:1,fieldCount:1,fields:[{tag:'INPUT',type:'text',qt:true,clipboard:true,hidden:true,width:0,height:0,tabIndex:-1,value:secret,id:secret,className:secret}],focus:{tag:'BODY'},lastTarget:{tag:'CANVAS'},events:{keydown:3,input:0,secret},key:secret,keys:[secret],text:secret,html:secret,url:secret,cookie:secret});
 assert.equal(d.events.keydown,3);assert.equal(d.events.input,0);assert.equal(d.fields[0].qt,true);assert.equal(d.fields[0].clipboard,true);assert.equal(d.fields[0].tabIndex,-1);assert.ok(!JSON.stringify(d).includes(secret));
});
test('diagnostic payload stays bounded under hostile callback input',()=>{
 const d=normalizeInputDiagnostic({format:'sentinel-input-diagnostic-v1',canvasCount:1e9,fieldCount:1e9,fields:Array(500).fill({tag:'INPUT',type:'email',width:1e9,height:1e9,value:'x'.repeat(20000)}),focus:{tag:'x'.repeat(20000)},lastEvent:'x'.repeat(20000),lastTarget:{},events:{keydown:Infinity}});assert.equal(d.fields.length,4);assert.equal(d.canvasCount,100);assert.equal(d.events.keydown,1000);assert.ok(JSON.stringify(d).length<2400);assert.equal(d.lastEvent,null);
});
test('unknown diagnostic format is rejected',()=>{assert.equal(normalizeInputDiagnostic({format:'other'}),null);assert.equal(normalizeInputDiagnostic(null),null);});
test('diagnostic chooses the actual control frame without preparing or executing a trade',async()=>{
 let probes=0,tradeCalls=0;const frame={evaluate:async(fn,args)=>{assert.equal(args.action,'start');probes++;return{ready:true};}};const page={isClosed:()=>false};const ui=new BrokerUiExecutor({sessions:new Map([['exnova',{page}]])});ui.controls=async()=>({frame});ui.prepare=ui.execute=async()=>tradeCalls++;await ui.diagnose('exnova');assert.equal(probes,1);assert.equal(tradeCalls,0);
});
test('PC keyboard diagnosis button is explicit and unavailable while bot is running',()=>{
 const a=executorPanel({provider:'exnova',config:{amount:1},enabled:false});assert.match(a,/executor-action="diagnose"/);assert.match(a,/Verificar teclado/);
 const b=executorPanel({provider:'exnova',config:{amount:1},enabled:true});assert.match(b,/executor-action="diagnose" disabled/);
});
