import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';import{createRequire,Module}from'node:module';import{fileURLToPath}from'node:url';
import{chromium}from'../sentinel-trading-lab/agent/node_modules/playwright-core/index.mjs';
const url=new URL('../sentinel-trading-lab/src/components/LiveScenarioCard.tsx',import.meta.url),req=createRequire(url),ts=req('typescript'),React=req('react');
const mod=new Module(fileURLToPath(url));mod.require=name=>name==='./SentinelLocale'?{useSentinelLocale:()=>({t:s=>s,locale:'pt'})}:name==='../lib/live-card-model'?req('../lib/live-card-model.ts'):req(name);
mod._compile(ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,fileURLToPath(url));
const css=readFileSync(new URL('../sentinel-trading-lab/src/app/globals.css',import.meta.url),'utf8'),render=req('react-dom/server').renderToStaticMarkup;
const b=await chromium.launch({headless:true,executablePath:process.env.SENTINEL_TEST_BROWSER,args:['--no-sandbox']});
try{const p=await b.newPage();const now=Date.now();
 for(const width of[320,360,393,768,1280])for(const durationMs of[30000,60000,300000]){
  await p.setViewportSize({width,height:1000});let originalTop=null,originalLineHeight=null;
  for(const text of['','LATERAL · PUT','INCONCLUSIVO · PUT','REVERSÃO EM TESTE · PUT',
   'REVERSÃO AINDA SEM QUEBRA · CALL','CONTINUIDADE TESTANDO RESISTÊNCIA · CALL','CONTINUIDADE PERDENDO FORÇA · CALL'])for(const age of[0,4000]){
   const s={agentVersion:'13.9.183',state:'running',runtimeKind:'remote-agent',remote:{online:true},settings:{entryFamily:'automatic',engine:'automatic',asset:'EUR/USD OTC',orderDurationMs:durationMs},liveBroker:{symbol:'EUR/USD OTC',assetValidated:true,analysisFeedValidated:true,lastQuoteAt:now,quote:1.1},lastEvalMs:now,
    lastResult:{asset:'EUR/USD OTC',analysis:{vnext:{mode:'now',engineId:'automatic',expirySeconds:durationMs/1000,nowObservation:{marketReading:text,quoteAt:now-age,observedAt:now,evaluatedAt:now},
     opportunityWindow:{phase:'fired',windowStartedAt:now-3000,windowEndsAt:now+durationMs},futureEntryAnchor:{side:'CALL',delaySeconds:durationMs/1000,holdingSeconds:durationMs/1000,issuedAt:now-3000,entryAt:now-3000,entryTriggeredAt:now-3000,exitAt:now+durationMs,projectedEntryPrice:1.1}}}}};
   const html=render(React.createElement(mod.exports.LiveScenarioCard,{s,busy:false,act:async()=>{},compact:true,onToggleCompact:()=>{}}));
   await p.setContent('<html data-theme="dark"><head><style>'+css+'</style></head><body><div class="app marketWorkspace">'+html+'</div></body></html>');
   assert.match(await p.locator('[data-testid="future-entry-decision"]').textContent(),/OPERAÇÃO EM ANDAMENTO/);
   assert.equal(await p.locator('[data-testid="native-expiry-mapping-picker"]').count(),0);
   assert.equal(await p.locator('details[data-testid="entry-family-picker"]').count(),0);
   const selects=p.locator('[data-testid="single-engine-selector"] > label > select');assert.equal(await selects.count(),3);
   const boxes=await selects.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,height:r.height,right:r.right};}));
   assert.ok(boxes.every(box=>Math.abs(box.y-boxes[0].y)<1&&box.height===boxes[0].height),'aligned selects '+JSON.stringify({width,boxes}));
   assert.ok(boxes.every(box=>box.right<=width),'controls must fit the mobile width');

   const line=p.locator('[data-testid="market-reading-detail"]');assert.equal(await line.evaluate(el=>getComputedStyle(el).fontSize),'12px');
   const y=(await p.locator('[data-testid="forecast-countdown-clock"]').boundingBox()).y;
   const lineHeight=(await line.boundingBox()).height;
   assert.ok(await line.evaluate(el=>el.scrollHeight<=el.clientHeight+1),'secondary text must remain fully visible');
   assert.equal(await line.evaluate(el=>getComputedStyle(el).whiteSpace),'normal');
   if(originalTop==null){originalTop=y;originalLineHeight=lineHeight;}
   else {assert.ok(Math.abs(y-originalTop)<1,'countdown must not move: '+JSON.stringify({width,durationMs,text,age,y,originalTop}));
    assert.equal(lineHeight,originalLineHeight,'phase row must retain its responsive height');}
   assert.ok(await line.locator('[data-testid=market-reading-text]').evaluate(el=>el.getBoundingClientRect().width<=el.parentElement.clientWidth+1),'no horizontal overflow');
   assert.equal(await line.locator('.marketReadingRowSizer').first().evaluate(el=>getComputedStyle(el).visibility),'hidden');
   if(width===393&&durationMs===60000&&text==='CONTINUIDADE PERDENDO FORÇA · CALL'&&age===4000)await p.screenshot({path:'/tmp/card-video-review/fixed-mobile.png',fullPage:true});
  }
 }
 await p.screenshot({path:'/workspace/scratch/3599ae2f921b/177-mobile-reading-verification.png',fullPage:true});
 console.log(JSON.stringify({mobileActualReactRender:true,widths:[320,360,393,768,1280],allThreeDurations:true,shortAndWrappedStaleMessagesStable:true,fullSecondaryTextVisible:true}));
}finally{await b.close()}
