import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {BrokerViewReader,parseVisibleBrokerView} from '../worker/broker-view-reader.mjs';
import {LocalPlaywrightDriver} from '../worker/local-playwright-driver.mjs';
const {chromium}=await import(process.env.SENTINEL_TEST_PLAYWRIGHT_MODULE||'playwright');
let browser,page;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.SENTINEL_TEST_BROWSER_PATH?{executablePath:process.env.SENTINEL_TEST_BROWSER_PATH}:{})});page=await browser.newPage({viewport:{width:1280,height:800}})});
after(async()=>{await browser?.close()});
const line=(text,x,y)=>({text,x,y,width:100,height:22});
test('screen geometry reads the chart heading instead of the background tab or chart interval',()=>{
 const v=parseVisibleBrokerView({width:1280,height:800,lines:[line('GBP/CAD (OTC)',260,12),line('Gold',80,76),line('1 min',70,540),line('Expiração',1130,65),line('30 seg',1130,100)]});assert.equal(v.symbol,'XAU/USD');assert.equal(v.expiry.ms,30000);
 assert.equal(parseVisibleBrokerView({width:1280,height:800,lines:[line('Gold',80,76),line('1 min',70,540)]}).expiry,null);
});
test('multiple headings and conflicting expiration values remain unconfirmed',()=>{
 assert.equal(parseVisibleBrokerView({width:1280,height:800,lines:[line('Gold',80,76),line('GBP/CAD (OTC)',80,115)]}).symbol,null);
 assert.equal(parseVisibleBrokerView({width:1280,height:800,lines:[line('Gold',80,76),line('Expiração',1130,65),line('1 min',1130,100),line('30 seg',1130,140)]}).expiry,null);
});
test('CDP reads closed shadow components and ignores Sentinel text',async()=>{
 await page.setContent('<html><body><broker-ui></broker-ui><div id="sentinel-trading-overlay-host"></div></body></html>');
 await page.evaluate(()=>{document.querySelector('broker-ui').attachShadow({mode:'closed'}).innerHTML='<button role="tab" aria-selected="true" style="position:absolute;left:70px;top:10px">Gold Blitz</button><div style="position:absolute;left:1130px;top:65px">Expiração</div><div style="position:absolute;left:1130px;top:100px">1 min</div>';document.querySelector('#sentinel-trading-overlay-host').attachShadow({mode:'open'}).innerHTML='<div style="position:absolute;left:70px;top:75px">GBP/CAD (OTC)</div><div style="position:absolute;left:1130px;top:140px">30 seg</div>';});
 const reader=new BrokerViewReader({dataDir:'worker/data/ocr-test'});const view=await reader.read(page);assert.equal(view.symbol,'XAU/USD');assert.equal(view.expiry.ms,60000);assert.ok(view.closedRoots>=1);await reader.cdp.detach();reader.ocr.close();
});
test('Windows native OCR reads a canvas chart and follows a switch without HTML controls',{skip:process.platform!=='win32'},async()=>{
 const driver=new LocalPlaywrightDriver({dataDir:'worker/data/canvas-ocr-test'});driver.session=async()=>({page,background:false});driver.requestMarketData=async()=>false;
 await page.setContent('<html><body style="margin:0"><canvas width="1280" height="800"></canvas></body></html>');
 const draw=async(symbol,duration)=>page.evaluate(({symbol,duration})=>{const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#1a3553';g.fillRect(0,0,1280,800);g.fillStyle='#ffffff';g.font='bold 26px Arial';g.fillText('IQ Option',10,27);g.fillText('GBP/CAD (OTC)',250,27);g.fillText(symbol,80,97);g.font='24px Arial';g.fillText('Expiration',1110,87);g.fillText(duration,1110,122);g.fillText('1 min',70,560)}, {symbol,duration});
 const st=driver.state('iq_option');st.activeMap.set('XAUUSD',1912);st.activeMap.set('GBPCADOTC',2114);st.assets.add('XAU/USD');st.assets.add('GBP/CAD OTC');
 await draw('Gold','1 min');await driver.domSnapshot('iq_option',{fast:true});assert.equal(st.uiSymbol,'XAU/USD',JSON.stringify(st.renderedView));await driver.scanExecutionUi('iq_option');assert.equal(st.expirationDurationMs,60000);assert.equal(st.executionReady,false);
 st.quote=4137;st.candles=[{open:4137,high:4138,low:4136,close:4137}];st.quoteHistory=[{ts:Date.now(),price:4137}];
 await draw('GBP/CAD (OTC)','30 sec');driver.viewReaders.get('iq_option').at=0;await driver.domSnapshot('iq_option',{fast:true});assert.equal(st.uiSymbol,'GBP/CAD OTC',JSON.stringify(st.renderedView));assert.equal(st.quote,null);assert.equal(st.candles.length,0);await driver.scanExecutionUi('iq_option');assert.equal(st.expirationDurationMs,30000,JSON.stringify(st.renderedView));assert.equal(st.executionReady,false);
 driver.ingest('iq_option',{name:'sendMessage',request_id:'background-gold',msg:{name:'get-candles',body:{active_id:1912,size:60}}},'page-out');assert.equal(st.uiSymbol,'GBP/CAD OTC');
 await driver.viewReaders.get('iq_option').cdp?.detach();driver.viewReaders.get('iq_option').ocr.close();
});
