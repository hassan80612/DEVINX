// Browser fixtures only; never connects to a broker or places a real order.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {BrokerUiExecutor} from '../sentinel-trading-lab/agent/worker/broker-ui-executor.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage(),errors=[],clicks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<label>Valor<input aria-label="Valor" id="amount" value="99"></label><label>Expiração<select aria-label="Expiração" id="duration"><option value="30">30 s</option><option value="60" selected>1 min</option><option value="120">2 min</option></select></label><button id="call">ACIMA</button><button id="put">ABAIXO</button>');
  let now=1800000000000,revision=1,serial=0;const c={provider,asset:'EUR/USD OTC',activeId:76,durationMs:30000,state:'running',licensed:true,engine:'automatic',analysis:{},brokerBalance:{provider,accountId:'10',amount:100,receivedAt:now,revision}};
  const driver={sessions:new Map([[provider,{page}]]),state:()=>({symbol:c.asset,activeId:c.activeId})};
  const ui=new BrokerUiExecutor(driver,{onSent:rid=>bot.sent(rid),onAccepted:e=>bot.accepted(e),onSettlement:e=>bot.settle(e)});
  const bot=new SignalExecutor({driver:ui,context:()=>c,clock:()=>now});bot.configure({amount:1,martingaleEnabled:true,martingaleLevels:2,stopLoss:20});
  await page.exposeFunction('__fixtureOrder',async(side,amount,durationMs)=>{
   clicks.push({side,amount,durationMs});assert.equal(amount,bot.pending.amount);assert.equal(durationMs,c.durationMs);
   const rid='fixture-'+(++serial);ui.observe(provider,{name:'sendMessage',request_id:rid,msg:{name:'binary-options.open-option',body:{price:amount,active_id:76,direction:side.toLowerCase(),user_balance_id:10}}},'page-out');
   ui.observe(provider,{name:'option',request_id:rid,msg:{id:serial,open_price:1,expiration_time:(now+durationMs)/1000}},'page-in');
  });
  await page.evaluate(()=>{for(const [id,side] of [['call','CALL'],['put','PUT']])document.getElementById(id).onclick=()=>window.__fixtureOrder(side,Number(document.getElementById('amount').value),Number(document.getElementById('duration').value)*1000);});
  const fire=async side=>{c.analysis={vnext:{futureEntryAnchor:{phase:'fired',engineId:c.engine,context:provider+'|EURUSDOTC|'+c.engine+'|'+c.durationMs,side,entryTriggeredAt:now,holdingSeconds:c.durationMs/1000,exitAt:now+c.durationMs,entryPrice:1}}};bot.pulse();await bot.inflight;};
  const close=net=>{const p=bot.pending;now=p.exitAt;c.brokerBalance={...c.brokerBalance,amount:bot.initialBalance+bot.net+net,receivedAt:now,revision:++revision};ui.observe(provider,{name:'option-closed',msg:{id:p.orderId,user_balance_id:10,amount:p.amount,profit_amount:p.amount+net}},'page-in');};
  await bot.start();assert.equal(clicks.length,0);assert.equal(await page.locator('#amount').inputValue(),'1');assert.equal(await page.locator('#duration').inputValue(),'30');
  await fire('CALL');close(-1);c.durationMs=60000;await fire('PUT');assert.equal(clicks[1].amount,2);assert.equal(clicks[1].durationMs,60000);close(1.72);assert.equal(bot.nextAmount(),1);
  await fire('CALL');close(-1);await fire('PUT');close(-2);await fire('CALL');close(-4);assert.equal(bot.nextAmount(),1);assert.deepEqual(clicks.map(c=>c.amount),[1,2,1,2,4]);
  bot.configure({amount:3});await page.evaluate(()=>document.getElementById('amount').onblur=e=>e.target.value='1');
  await fire('PUT');assert.equal(clicks.length,5);assert.equal(bot.enabled,false);assert.match(bot.message,/Valor da entrada não confirmado/);
  assert.deepEqual(errors,[]);results.push({provider,clicks,ignoredEditBlocksDirection:true,actualBrokerOrders:false});await page.close();
 }

 for(const provider of ['iq_option','exnova']){
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  await page.setContent('<style>body{margin:0}canvas{display:block}input{position:absolute;width:100px;display:none}</style><canvas id="room" width="1000" height="800"></canvas><input id="amount" aria-label="Valor" style="left:800px;top:100px" value="1"><input id="duration" aria-label="Expiração (s)" data-duration-unit="s" style="left:800px;top:150px" value="60">');
  await page.evaluate(()=>{const canvas=document.querySelector('canvas');canvas.onclick=e=>{const id=e.clientY<140?'amount':'duration';if(e.clientX<800||e.clientY<100||e.clientY>190)return;const input=document.getElementById(id);input.style.display='block';input.focus();input.onblur=()=>input.style.display='none';};});
  const {canvasControlBridge,normalizeCanvasBinding}=await import('../sentinel-trading-lab/agent/worker/canvas-executor-targets.mjs');
  const binding=normalizeCanvasBinding({format:'sentinel-canvas-targets-v1',origin:'http://fixture.invalid',path:'/',canvas:{id:'room',domPath:'html:1/body:1/canvas:1',width:1000,height:800,viewportWidth:1000,viewportHeight:800,pixelRatio:1},targets:{CALL:{x:900,y:300},PUT:{x:900,y:400},amount:{x:850,y:110},duration:{x:850,y:160}}});
  // about:blank has no matching origin; only the parameter editing adapter is
  // exercised here. Binding origin/size guards have separate canvas tests.
  const driver={sessions:new Map([[provider,{page}]])};const {BrokerTradeParameters}=await import('../sentinel-trading-lab/agent/worker/broker-trade-parameters.mjs');
  const parameters=new BrokerTradeParameters(driver);await parameters.apply(provider,{frame:page,canvasSelector:'#room',positions:binding.targets},{amount:4,durationMs:30000});
  assert.equal(await page.locator('#amount').inputValue(),'4');assert.equal(await page.locator('#duration').inputValue(),'30');
  results.push({provider,mappedCanvasEditors:true,stakeVerified:4,expiryVerifiedMs:30000,actualBrokerOrders:false});await page.close();
 }
 await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13946-broker-browser-fixture.json',JSON.stringify({nativeBrokerTested:false,results},null,2)+'\n');console.log(JSON.stringify(results));
}finally{await browser.close();}
