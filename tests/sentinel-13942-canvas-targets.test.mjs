import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCanvasBinding} from '../sentinel-trading-lab/agent/worker/canvas-executor-targets.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {executorPanel,executorActions} from '../sentinel-trading-lab/agent/worker/executor-panel.mjs';
const binding=()=>({format:'sentinel-canvas-targets-v1',origin:'https://exnova.com',path:'/traderoom',canvas:{id:'room',domPath:'html:1/body:1/canvas:1',width:1000,height:800,viewportWidth:1000,viewportHeight:800,pixelRatio:1},targets:{CALL:{x:900,y:300},PUT:{x:900,y:450}}});
test('local mapping round-trips through JSON without mixing broker points',()=>{
 const exnova=binding(),iq={...binding(),origin:'https://iqoption.com',targets:{CALL:{x:850,y:250},PUT:{x:850,y:400}}};
 const ui=new BrokerUiExecutor({});ui.restoreBindings(JSON.parse(JSON.stringify({exnova,iq_option:iq})));assert.deepEqual(ui.canvasBindings.exnova.targets,exnova.targets);assert.deepEqual(ui.canvasBindings.iq_option.targets,iq.targets);assert.notDeepEqual(ui.canvasBindings.exnova.targets,ui.canvasBindings.iq_option.targets);
});
test('malformed/out-of-canvas/identical targets are rejected before persistence',()=>{
 for(const mutate of [v=>v.targets.PUT=v.targets.CALL,v=>v.targets.CALL.x=-1,v=>v.targets.PUT.y=800,v=>v.canvas.width=Infinity,v=>v.canvas.pixelRatio=0,v=>v.origin='javascript:alert(1)',v=>v.canvas.domPath=null]){const v=binding();mutate(v);assert.throws(()=>normalizeCanvasBinding(v));}
});
test('loading a malformed provider mapping preserves the other provider',()=>{
 const ui=new BrokerUiExecutor({});ui.restoreBindings({exnova:binding(),iq_option:{format:'broken'}});assert.ok(ui.canvasBindings.exnova);assert.equal(ui.canvasBindings.iq_option,undefined);
});
test('local mapper does not start execution or place a click',async()=>{
 const calls=[],page={evaluate:async(fn,args)=>{calls.push(args.action);return{ready:true};}},ui=new BrokerUiExecutor({sessions:new Map([['exnova',{page}]])});await ui.beginCalibration('exnova');assert.deepEqual(calls,['calibrate']);assert.equal(ui.canvasBindings.exnova,undefined);
});
test('map save checks the live page before accepting stale points',async()=>{
 const ui=new BrokerUiExecutor({sessions:new Map([['exnova',{page:{evaluate:async()=>({error:'Tamanho ou zoom mudou'})}}]])});await assert.rejects(ui.saveBinding('exnova',binding()),/zoom/);assert.equal(ui.canvasBindings.exnova,undefined);
});
test('bot panel names the selected broker and exposes one mapping action',()=>{
 for(const [provider,label] of [['iq_option','IQ Option'],['exnova','Exnova']]){const html=executorPanel({provider,config:{}})+executorActions({provider,config:{}});assert.ok(html.includes(label));assert.equal((html.match(/data-sentinel-executor-action="map"/g)||[]).length,1);}
});

test('canvas actionability uses the remaining valid signal budget without a second click or extended deadline',async()=>{
 const ui=new BrokerUiExecutor({state:()=>({symbol:'EUR/USD OTC',activeId:76})},{ackTimeoutMs:10});
 let clicks=0,options;
 ui.controls=async()=>({canvasSelector:'canvas',positions:{CALL:{x:900,y:300}},frame:{evaluate:async()=>({blocked:false}),locator:()=>({click:async opts=>{
  clicks++;options=opts;
  if(opts.timeout<400)throw Error('locator.click: Timeout exceeded before canvas ready');
 }})}});
 const deadline=Date.now()+800;
 const order={id:'budget',asset:'EUR/USD OTC',activeId:76,side:'CALL',entryDeadlineAt:deadline,isValid:()=>Date.now()<deadline};
 const result=await ui.execute('exnova',order);
 assert.equal(clicks,1);assert.equal(order.clicked,true);assert.equal(result.pending,true);
 assert.ok(options.timeout>=400&&options.timeout<=770);
 assert.equal(order.entryDeadlineAt,deadline);assert.equal(order.dispatchUncertain,undefined);
});
