// Synthetic broker pages only. No accounts, credentials or financial orders.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']}),results=[];
try{
 for(const provider of ['iq_option','exnova'])for(const canvas of [false,true]){
  const page=await browser.newPage({viewport:{width:1100,height:850}}),clicks=[],acks=[];let serial=0,now=1800000000000;
  const context={provider,activeId:76,asset:'EUR/USD OTC',durationMs:60000,engine:'automatic',state:'running',licensed:true,analysis:{},brokerBalance:null};
  const driver={sessions:new Map([[provider,{page}]]),state:()=>({symbol:'EUR/USD OTC',activeId:76})};
  let bot;const ui=new BrokerUiExecutor(driver,{onSent:(rid,id)=>bot.sent(rid,id),onAccepted:e=>bot.accepted(e),onRejected:e=>bot.rejected(e),onSettlement:e=>bot.settle(e)});
  bot=new SignalExecutor({driver:ui,context:()=>context,clock:()=>now});bot.configure({amount:1,martingaleEnabled:true,martingaleLevels:3});
  await page.exposeFunction('fixtureClick',side=>{
   const rid='request-'+(++serial),id='order-'+serial;clicks.push({side,id,amount:1,durationMs:60000,at:Date.now()});
   ui.observe(provider,{name:'sendMessage',request_id:rid,msg:{name:'binary-options.open-option',body:{user_balance_id:10,price:1,active_id:76,direction:side.toLowerCase()}}},'page-out');
   setTimeout(()=>{acks.push({id,at:Date.now()});ui.observe(provider,{name:'option',request_id:rid,msg:{id,open_price:1.1,expiration_time:(now+60000)/1000}},'page-in');},600);
  });
  await page.setContent(canvas?'<canvas id="room" width="1100" height="850" style="display:block;width:1100px;height:850px"></canvas>':'<button id="call">ACIMA</button><button id="put">ABAIXO</button>');
  await page.evaluate(({canvas})=>{
   window.parameterWrites=0;window.zoomChanges=0;document.body.style.margin='0';
   if(canvas){const e=document.querySelector('canvas'),c=e.getContext('2d');c.fillStyle='#18363c';c.fillRect(0,0,1100,850);c.fillStyle='#139f59';c.fillRect(900,250,150,120);c.fillStyle='#bd6429';c.fillRect(900,450,150,120);e.addEventListener('click',event=>{const x=event.offsetX,y=event.offsetY;if(x>900&&x<1050&&y>250&&y<370)window.fixtureClick('CALL');else if(x>900&&x<1050&&y>450&&y<570)window.fixtureClick('PUT');else window.zoomChanges++;});}
   else{document.querySelector('#call').onclick=()=>window.fixtureClick('CALL');document.querySelector('#put').onclick=()=>window.fixtureClick('PUT');}
  },{canvas});
  if(canvas){const binding=await page.evaluate(()=>({format:'sentinel-canvas-targets-v1',origin:location.origin,path:location.pathname,canvas:{id:'room',domPath:'html:1/body:1/canvas:1',width:1100,height:850,viewportWidth:1100,viewportHeight:850,pixelRatio:devicePixelRatio},targets:{CALL:{x:975,y:310},PUT:{x:975,y:510},amount:{x:970,y:100},duration:{x:970,y:180}},durationUnit:'text'}));binding.origin='http://fixture.test';
   // Local about:blank fixture has no broker origin. Route a synthetic URL so
   // the exact production mapping origin/path checks remain enabled.
   const html=await page.content();await page.route('http://fixture.test/**',r=>r.fulfill({status:200,contentType:'text/html',body:html}));await page.goto('http://fixture.test/traderoom');binding.path='/traderoom';
   await page.evaluate(()=>{window.zoomChanges=0;const e=document.querySelector('canvas');e.addEventListener('click',event=>{const x=event.offsetX,y=event.offsetY;if(x>900&&x<1050&&y>250&&y<370)window.fixtureClick('CALL');else if(x>900&&x<1050&&y>450&&y<570)window.fixtureClick('PUT');else window.zoomChanges++;});});
   ui.restoreBindings({[provider]:binding});assert.deepEqual(Object.keys(ui.canvasBindings[provider].targets),['CALL','PUT']);
  }
  await bot.start();assert.equal(clicks.length,0,'activation makes no UI clicks');
  const rounds=[];
  for(const [count,side,win] of [[1,'CALL',false],[2,'PUT',false],[4,'CALL',false],[8,'PUT',true],[1,'CALL',true]]){
   const start=clicks.length;context.analysis={vnext:{futureEntryAnchor:{context:provider+'|EURUSDOTC|automatic|60000',engineId:'automatic',phase:'fired',side,entryTriggeredAt:now,holdingSeconds:60,exitAt:now+60000}}};bot.pulse();await bot.inflight;
   assert.ok(bot.enabled,bot.message);assert.equal(clicks.length-start,count);const sent=clicks.slice(start);assert.ok(sent.every(x=>x.side===side&&x.amount===1));
   if(count>1)assert.ok(sent[1].at<acks.find(x=>x.id===sent[0].id).at,'no network acknowledgement wait between physical clicks');
   assert.ok(sent.at(-1).at-sent[0].at<1500);
   now+=60000;for(const entry of [...sent].reverse())ui.observe(provider,{name:'option-closed',msg:{id:entry.id,user_balance_id:10,amount:1,profit_amount:win?1.86:0}},'page-in');
   assert.equal(bot.pending,null);rounds.push({clicks:count,side,unitAmount:1,netResult:win?'win':'loss',dispatchSpanMs:sent.at(-1).at-sent[0].at});
  }
  assert.equal(bot.nextClicks(),1);assert.equal(await page.evaluate(()=>window.zoomChanges),0);assert.equal(await page.locator('input,select,textarea').count(),0);results.push({provider,canvas,rounds,noParameterEditors:true,noActivationClicks:true,chartZoomUntouched:true,realOrders:0});await page.close();
 }
 await writeFile('reports/sentinel-13951-click-browser-fixture.json',JSON.stringify({realBrokerTested:false,nativeWindowsTested:false,results},null,2)+'\n');console.log(JSON.stringify({realBrokerTested:false,results},null,2));
}finally{await browser.close();}
