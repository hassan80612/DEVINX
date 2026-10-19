// The real mobile page, fixture API and real executor; no broker connection.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('../sentinel-trading-lab/src/app/api/auth/mobile-fixture/',import.meta.url));
await mkdir(fixture,{recursive:true});await writeFile(fixture+'page.tsx',"export {default} from '../../../console/page';\n");
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3044'],{cwd:fileURLToPath(new URL('../sentinel-trading-lab/',import.meta.url)),stdio:['ignore','pipe','pipe']});
let serverLog='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>serverLog+=chunk);
for(let i=0;i<80&&!serverLog.includes('Ready in');i++){if(server.exitCode!==null)throw Error(serverLog);await new Promise(r=>setTimeout(r,500));}
if(!serverLog.includes('Ready in')){server.kill();throw Error(serverLog);}
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {chromium} from '../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
import {SignalExecutor} from '../sentinel-trading-lab/agent/worker/signal-executor.mjs';
import {packExecutor,unpackExecutor,dispatchExecutor} from '../sentinel-trading-lab/agent/worker/executor-remote.mjs';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1193/chrome-linux/headless_shell',headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const provider of ['iq_option','exnova']){
  let now=Date.now();const clicks=[],commands=[],errors=[];
  const c={provider,asset:'EUR/GBP OTC',durationMs:30000,engine:'trend',state:'running',licensed:true,analysis:{},brokerBalance:{provider,accountId:'10',amount:20,receivedAt:now,revision:1}};
  const bot=new SignalExecutor({clock:()=>now,context:()=>c,driver:{prepare:async()=>{},execute:async(p,o)=>{assert.ok(o.isValid());o.captureEntry();o.clicked=true;clicks.push(o.side);return{accepted:true,orderId:'fixture-1'};}}});
  bot.configure({initialBalance:20,amount:1,payoutPercent:86,stopLoss:5});
  const status=()=>({agentVersion:'13.9.46',runtimeKind:'remote-agent',remote:{online:true},state:c.state,mode:'demo',activeProvider:provider,autoExecutor:unpackExecutor(packExecutor({...bot.status(),provider,updatedAt:Date.now()})),settings:{engine:c.engine,asset:c.asset,orderDurationMs:c.durationMs,forecastMode:'now'},liveBroker:{provider,symbol:c.asset,quote:1,lastQuoteAt:Date.now(),assetValidated:true,analysisFeedValidated:true},lastResult:{asset:c.asset,analysis:{}},recentTrades:[],recentAnalyses:[]});
  const run=async(action,payload)=>{if(action==='executor-config')return bot.configure(payload.patch);if(action==='executor-start')return bot.start();return bot.stop();};
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/auth/me',r=>r.fulfill({json:{ok:true,user:{email:'fixture@example.invalid'},profile:{role:'user',access_active:true}}}));
  await page.route('**/api/auth/presence',r=>r.fulfill({json:{ok:true}}));
  await page.route('**/api/runtime/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname.replace('/api/runtime/','');
   if(path!=='status'){
    assert.ok(['executor/start','executor/stop','executor/config'].includes(path),path);commands.push(path);
    try{await dispatchExecutor('/'+path,request.postDataJSON()||{},run,()=>c);}
    catch(e){await route.fulfill({json:{ok:false,error:e.message}});return;}
   }
   await route.fulfill({json:{ok:true,data:status()}});
  });
  await page.goto('http://127.0.0.1:3044/api/auth/mobile-fixture');
  const panel=page.getByRole('region',{name:'Bot automático'});
  await panel.getByRole('button',{name:'Ligar bot'}).waitFor();
  assert.equal(clicks.length,0);assert.equal(bot.enabled,false);
  assert.equal(await panel.getByRole('spinbutton',{name:'Saldo inicial manual',exact:true}).count(),0);
  assert.equal(await panel.getByRole('spinbutton',{name:'Payout (%)',exact:true}).count(),0);
  await panel.getByRole('spinbutton',{name:'Níveis de martingale (0 = desligado)',exact:true}).fill('2');
  await panel.getByRole('checkbox',{name:'Ativar martingale',exact:true}).check();
  await panel.getByRole('spinbutton',{name:'Parar em (min)',exact:true}).fill('3');
  await panel.getByRole('button',{name:'Ligar bot'}).click();
  await panel.getByRole('button',{name:'Ligar bot'}).waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.botControl')?.textContent.includes('Ligado'));
  assert.ok(bot.enabled);assert.equal(bot.config.stopAfterMinutes,3);assert.equal(bot.config.martingaleEnabled,true);assert.equal(bot.config.martingaleLevels,2);assert.equal(clicks.length,0);
  c.analysis={vnext:{futureEntryAnchor:{phase:'fired',side:'CALL',context:provider+'|EURGBPOTC|trend|30000',entryTriggeredAt:now,holdingSeconds:30,exitAt:now+30000,entryPrice:1}}};bot.pulse();await bot.inflight;
  assert.deepEqual(clicks,['CALL']);
  await panel.getByRole('spinbutton',{name:'Perda máxima na sessão (moeda da conta)',exact:true}).fill('8');
  await panel.getByRole('button',{name:'Salvar limites'}).click();
  await page.waitForFunction(()=>document.querySelector('.botControl')?.textContent.includes('Configuração do bot aplicada'));
  assert.ok(bot.enabled);assert.equal(bot.config.stopLoss,8);assert.ok(bot.pending);
  await panel.getByRole('button',{name:'Parar bot'}).click();
  await page.waitForFunction(()=>document.querySelector('.botControl')?.textContent.includes('Parado por você'));
  assert.equal(bot.enabled,false);assert.ok(bot.pending);assert.equal(await panel.getByRole('button',{name:'Ligar bot'}).isDisabled(),true);
  await panel.getByRole('spinbutton',{name:'Parar em (min)',exact:true}).fill('0');
  await panel.getByRole('button',{name:'Salvar limites'}).click();
  await page.waitForFunction(()=>document.querySelector('.botControl')?.textContent.includes('Configuração do bot aplicada'));
  assert.equal(bot.config.stopAfterMinutes,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);results.push({provider,mobileViewport:'390x844',commands,clicks,liveEdits:true,stopPreservesOpenTrade:true,pageErrors:errors});await page.close();
 }
 await mkdir('reports',{recursive:true});await writeFile('reports/sentinel-13946-mobile-browser-fixture.json',JSON.stringify({realBrokerOrders:false,nativeWindowsLaunch:false,results},null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();server.kill('SIGTERM');await rm(fixture,{recursive:true,force:true});await writeFile('../mobile46-next-browser-server.log',serverLog);}

