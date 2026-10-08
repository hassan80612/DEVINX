import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DemoTradingRuntime } from '../sentinel-trading-lab/agent/src/core/runtime.mjs';
import { analyzeMarket } from '../sentinel-trading-lab/agent/src/core/strategy.mjs';
import { LocalPlaywrightDriver } from '../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs';

test('Sentinel clears old forecast state when runtime asset changes', () => {
  const runtime = new DemoTradingRuntime({ seed: 7, balance: 10000 });
  runtime.settings.asset = 'EUR/USD';
  runtime.lastResult = {
    asset: 'EUR/USD',
    analysis: {
      entryPlanner: {
        horizons: {
          '60': { asset: 'EUR/USD', callTrigger: 1.1162, putTrigger: 1.1173 }
        }
      }
    }
  };

  runtime.setExternalMarket({
    provider: 'iq_option',
    symbol: 'Gold',
    uiSymbol: 'Gold',
    quote: 4132.858,
    candles: [],
    quoteHistory: [],
    feedValidated: false
  });

  assert.equal(runtime.settings.asset, 'GOLD');
  assert.equal(runtime.lastResult.asset, 'GOLD');
  assert.equal(runtime.lastResult.analysis.entryPlanner, undefined);
});

test('Sentinel rejects a planner from another asset in the operational signal', () => {
  const runtime = new DemoTradingRuntime({ seed: 8, balance: 10000 });
  runtime.settings.asset = 'GOLD';

  const result = runtime._entryTimingState({
    generalConsensus: { side: 'CALL', state: 'ALINHADO', strength: 70, edge: 20 },
    quality: {},
    entryPlanner: {
      horizons: {
        '60': {
          asset: 'EUR/USD',
          bias: 'CALL',
          rawBias: 'CALL',
          confidence: 80,
          outlookReady: true,
          callTrigger: 1.1162,
          putTrigger: 1.1173
        }
      }
    }
  }, { price: 4132.858 }, Date.now());

  assert.equal(result.trigger, null);
  assert.match(result.reason, /Aguardando preço e previsão/);
});

test('Future direction stays independent from current entry consensus', () => {
  const runtime = new DemoTradingRuntime({ seed: 9, balance: 10000 });
  runtime.settings.asset = 'GOLD';

  const analysis = {
    generalConsensus: { side: 'PUT' },
    entryPlanner: {
      horizons: {
        '60': {
          bias: 'CALL',
          confidence: 62,
          modelConfidence: 62,
          outlookReady: true,
          callProbability: 64,
          putProbability: 36
        }
      }
    }
  };

  runtime._mergeScenarioConfluence(analysis, { cards: [] }, { price: 4132.858 }, Date.now());
  const plan = analysis.entryPlanner.horizons['60'];

  assert.equal(plan.asset, 'GOLD');
  assert.equal(plan.executionBias, 'CALL');
  assert.equal(plan.entryAligned, false);
});

test('Future engine exposes a directional horizon separately from entry readiness', () => {
  const now = Date.now();
  const base = Math.floor(now / 1000) - 120 * 60;
  const candles = Array.from({ length: 120 }, (_, i) => {
    const open = 4100 + i * 0.25;
    const close = open + 0.16;
    return {
      from: base + i * 60,
      to: base + (i + 1) * 60,
      open,
      high: close + 0.08,
      low: open - 0.07,
      close,
      volume: 100 + i
    };
  });
  const last = candles.at(-1).close;
  const quoteHistory = Array.from({ length: 40 }, (_, i) => ({
    ts: now - 39000 + i * 1000,
    price: last - 0.8 + i * 0.022
  }));

  const analysis = analyzeMarket({
    candles,
    quoteHistory,
    strategy: 'trend',
    minConfidence: 70,
    durationMs: 60000,
    freshnessMs: 5000,
    quoteTs: now,
    now
  });

  const plan = analysis.entryPlanner.horizons['60'];
  assert.equal(plan.outlookReady, true);
  assert.ok(plan.callProbability > plan.putProbability);
  assert.equal(plan.bias, 'CALL');
  assert.equal(typeof plan.directionReady, 'boolean');
  assert.match(plan.basis, /independente do consenso atual/);
});


test('Overlay cache is never reused on the instant the visible asset changes', async () => {
  const worker = await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs', import.meta.url), 'utf8');
  assert.ok(worker.includes("let overlayAssetKey=''"));
  assert.ok(worker.includes("switched=!!overlayAssetKey&&overlayAssetKey!==key"));
  assert.ok(worker.includes("if(!switched){const cached=overlayCache.get(key)"));
});

test('Future overlay requires planner asset identity and a fresh post-switch analysis', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("plannerAsset===visibleAsset"));
  assert.ok(ui.includes("plannerGeneratedAt>assetChangedAt"));
  assert.ok(ui.includes("plannerReadable=!assetJustChanged"));
});


test('IQ asset bridge is installed in already-open child frames', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('for(const frame of page.frames())'));
  assert.ok(ui.includes('if(frame===page.mainFrame())continue'));
  assert.ok(ui.includes('await frame.evaluate(install).catch(()=>{})'));
});


test('IQ asset tracker recognizes named tabs without continuous DOM polling', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("['GOLD','Gold']"));
  assert.ok(ui.includes('function assetStrings'));
  assert.ok(!ui.includes('__sentinelAssetPoll'));
  assert.ok(!ui.includes('new MutationObserver'));
  assert.ok(ui.includes("page.on('frameattached',installFrame)"));
  assert.ok(ui.includes("page.on('framenavigated',installFrame)"));
});


test('Broker active_id switch invalidates the old asset before symbol resolution', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("st.pendingPageActiveId=Number(aid)"));
  assert.ok(ui.includes("st.candles=[];st.quote=null;st.quoteHistory=[]"));
  assert.ok(ui.includes("st.marketStatus='switching'"));
  assert.ok(ui.includes("let next=symbol?assetStrings(symbol)[0]||null:null"));
  assert.ok(worker.includes("status=String(m.marketStatus||'').toLowerCase()"));
  assert.ok(worker.includes("unresolvedSwitch=status==='switching'"));
  assert.ok(worker.includes("brokerSwitching?'SINCRONIZANDO'"));
});


test('Market frames are accepted only when tied to the current active_id', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('function requestedActiveId'));
  assert.ok(ui.includes('st.marketRequests.set'));
  assert.ok(ui.includes('aid!=null&&Number(aid)===Number(st.activeId)'));
  assert.ok(ui.includes('st.candleActiveId=Number(aid)'));
  assert.ok(ui.includes('candleAssetMatch'));
  assert.ok(ui.includes('rejectedMarketFrames'));
});

test('Asset changes wipe candle and micro-quote history before the new feed is analyzed', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null"));
  assert.ok(ui.includes("st.candleIntegrity={ok:false,reason:'asset_switch'}"));
  assert.ok(ui.includes('function candleSeriesIntegrity'));
  assert.ok(ui.includes("Histórico rejeitado por mistura/inconsistência de ativo"));
});

test('Recovery never probes or restores a hidden alternate asset', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(!ui.includes('quoteHistory:[...(st.quoteHistory||[])]'));
  assert.ok(!ui.includes('st.quoteHistory=saved.quoteHistory'));
  assert.ok(!ui.includes('Sugestão disponível:'));
  assert.ok(ui.includes('nenhum outro ativo será consultado em segundo plano'));
});


test('Background IQ subscriptions never retarget the selected asset', () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-active-selection'});
  const st=d.state('iq_option');
  st.uiSymbol='EUR/USD OTC';st.symbol='EUR/USD OTC';st.activeId=76;
  st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPCADOTC',86);
  st.assets.add('EUR/USD OTC');st.assets.add('GBP/CAD OTC');

  d.ingest('iq_option',JSON.stringify({name:'subscribeMessage',msg:{name:'candle-generated',params:{routingFilters:{active_id:86,size:60}}}}),'page-out');
  assert.equal(st.symbol,'EUR/USD OTC');
  assert.equal(Number(st.activeId),76);

  d.ingest('iq_option',JSON.stringify({name:'sendMessage',request_id:'chart-switch',msg:{name:'get-candles',body:{active_id:86,size:60}}}),'page-out');
  assert.equal(st.symbol,'GBP/CAD OTC');
  assert.equal(st.uiSymbol,'GBP/CAD OTC');
  assert.equal(Number(st.activeId),86);
});


test('Forced history refresh does not stack duplicate live candle subscriptions while the stream is fresh', async () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-subscription-dedupe'});
  const st=d.state('iq_option');
  st.uiSymbol='EUR/USD OTC';st.symbol='EUR/USD OTC';st.activeId=76;st.subscribedSymbol='EUR/USD OTC';st.subscribedActiveId=76;
  st.activeMap.set('EURUSDOTC',76);st.assets.add('EUR/USD OTC');
  st.candles=Array.from({length:50},(_,i)=>({from:1700000000+i*60,to:1700000060+i*60,open:1,high:1.01,low:.99,close:1,volume:1}));
  st.candleActiveId=76;st.lastQuoteAt=Date.now();
  const sent=[];
  d.directFeed=async()=>({ready:true,serverTimeSeconds:()=>1700010000,request:async()=>({name:'candles',request_id:'x',msg:{}})});
  d.wsSend=async(_provider,payload)=>{sent.push(payload);return{ok:true,transport:'test'}};
  await d._requestCandles('iq_option',{symbol:'EUR/USD OTC',activeId:76,force:true});
  assert.equal(sent.filter(x=>x?.name==='subscribeMessage'&&x?.msg?.name==='candle-generated').length,0);
  assert.equal(sent.filter(x=>x?.name==='unsubscribeMessage'&&x?.msg?.name==='candle-generated').length,0);
});

test('A stale live stream is renewed once without stacking subscriptions', async () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-subscription-revive'});
  const st=d.state('iq_option');
  st.uiSymbol='EUR/USD OTC';st.symbol='EUR/USD OTC';st.activeId=76;st.subscribedSymbol='EUR/USD OTC';st.subscribedActiveId=76;
  st.activeMap.set('EURUSDOTC',76);st.assets.add('EUR/USD OTC');
  st.lastQuoteAt=Date.now()-9000;
  const sent=[];
  d.directFeed=async()=>({ready:true,serverTimeSeconds:()=>Math.floor(Date.now()/1000),request:async()=>({name:'candles',request_id:'x',msg:{}})});
  d.wsSend=async(_provider,payload)=>{sent.push(payload);return{ok:true,transport:'test'}};
  await d._requestCandles('iq_option',{symbol:'EUR/USD OTC',activeId:76,force:true});
  assert.equal(sent.filter(x=>x?.name==='unsubscribeMessage'&&x?.msg?.name==='candle-generated').length,1);
  assert.equal(sent.filter(x=>x?.name==='subscribeMessage'&&x?.msg?.name==='candle-generated').length,1);
});

test('Market recovery retries only the broker-visible asset and never probes alternatives', async () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-no-probe'});
  const st=d.state('iq_option');
  st.uiSymbol='EUR/USD OTC';st.symbol='EUR/USD OTC';st.activeId=76;st.mode='demo';
  st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPCADOTC',86);
  st.assets.add('EUR/USD OTC');st.assets.add('GBP/CAD OTC');
  const calls=[];
  d._requestCandles=async(_provider,args)=>{calls.push(args);return false};
  await d.recoverMarket('iq_option');
  assert.equal(calls.length,1);
  assert.equal(calls[0].symbol,'EUR/USD OTC');
  assert.equal(Number(calls[0].activeId),76);
  assert.equal(st.suggestedSymbol,null);
});

test('High-frequency market frames skip the generic recursive scan', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('const highFrequencyMarketFrame='));
  assert.ok(ui.includes('const shouldGenericScan=!highFrequencyMarketFrame'));
  assert.ok(ui.includes('if(shouldGenericScan)try{recursiveScan(data,out)}catch{}'));
  assert.ok(!ui.includes('lastGenericMarketScanAt'));
});


test('Existing tab clicks become hints and never retarget the validated asset by themselves', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("source:'tab-click-hint'"));
  assert.ok(ui.includes("if(source==='tab-click-hint'&&changed&&current)"));
  assert.ok(ui.includes("st.marketStatus='unvalidated'"));
  assert.ok(ui.includes('Ativo clicado ainda não validado'));
  assert.ok(!ui.includes('selected-tab-settled'));
});

test('Future UI reserves directional entry instructions for operational timing gates', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("const futureActionLabel="));
  assert.ok(ui.includes("'ENTRAR AGORA · '+operationalHeroSide"));
  assert.ok(!ui.includes("!plannerConfirmed&&formingSide?'AGUARDAR'"));
  assert.ok(ui.includes('AGUARDE O SINAL DE ENTRADA'));
  assert.ok(!ui.includes("('CONFIRMANDO '+displayCandidate)"));
  assert.ok(!ui.includes('EM FORMAÇÃO'));
});


test('Asset-change events force immediate runtime synchronization before new analysis', async () => {
  const worker = await readFile(new URL('../sentinel-trading-lab/agent/worker/index.mjs', import.meta.url), 'utf8');
  assert.ok(worker.includes('driver.setMarketUpdateHandler?.((provider,event={})=>'));
  assert.ok(worker.includes('if(event.assetChanged===true){'));
  assert.ok(worker.includes('syncRuntimeMarket();'));
  assert.ok(worker.includes("const VERSION='13.4.14'"));
});

test('Protocol active_id changes are surfaced as assetChanged events', () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-switch-event'});
  const st=d.state('iq_option');
  st.uiSymbol='EUR/USD OTC';st.symbol='EUR/USD OTC';st.activeId=76;st.pageActiveId=76;
  st.activeMap.set('EURUSDOTC',76);st.activeMap.set('GBPCADOTC',86);
  st.assets.add('EUR/USD OTC');st.assets.add('GBP/CAD OTC');
  let event=null;
  d.setMarketUpdateHandler((_provider,payload)=>{event=payload});
  d.ingest('iq_option',JSON.stringify({name:'sendMessage',request_id:'chart-switch-2',msg:{name:'get-candles',body:{active_id:86,size:60}}}),'page-out');
  assert.equal(event?.assetChanged,true);
  assert.equal(st.marketStatus,'switching');
  assert.equal(st.candles.length,0);
  assert.equal(st.quoteHistory.length,0);
});


test('IQ asset tracking has no continuous DOM polling or selected-tab watcher', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(!ui.includes('__sentinelAssetWatchTimer'));
  assert.ok(!ui.includes('watchSelected'));
  assert.ok(!ui.includes('vividLineScore'));
  assert.ok(!ui.includes('new MutationObserver'));
});

test('Quote history appends in place instead of copying a large array on every tick', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('function appendQuoteSample(st,ts,price)'));
  assert.ok(ui.includes('st.quoteHistory.push({ts:t,price:p})'));
  assert.ok(ui.includes('if(st.quoteHistory.length>7200)st.quoteHistory.splice(0,st.quoteHistory.length-6800)'));
  assert.ok(!ui.includes("slice(-1800)"));
});

test('Calibration epoch isolates broken historical feed results from the new engine', async () => {
  const runtime = await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url), 'utf8');
  assert.ok(runtime.includes("const CALIBRATION_EPOCH='feed-v4-context-confirmed-quotes'"));
  assert.ok(runtime.includes("['micro-v5',CALIBRATION_EPOCH,kind"));
  assert.ok(runtime.includes("filter(x=>String(x?.key||'').startsWith(prefix))"));
  assert.ok(runtime.includes("probabilitySource:historyWeight>0?'model+empirical':'model'"));
  assert.ok(runtime.includes('historyWeight=Math.min(.65'));
});

test('Strategy cards use their own future horizon forecasts instead of current raw score', async () => {
  const runtime = await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url), 'utf8');
  assert.ok(runtime.includes('futureByHorizon'));
  assert.ok(runtime.includes("a?.entryPlanner?.horizons||{}"));
  assert.ok(runtime.includes('projectionHorizonSeconds'));
  assert.ok(runtime.includes("modelVersion='future-v5.0'"));
  assert.ok(runtime.includes('strategyFutureBias'));
});

test('Operational decision no longer requires present side to equal future side', async () => {
  const runtime = await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url), 'utf8');
  assert.ok(runtime.includes("const presentSide=['CALL','PUT'].includes"));
  assert.ok(runtime.includes("candidateSide=futureReady?futureSide:'AGUARDAR'"));
  assert.ok(runtime.includes("const side=lockedSide||candidateSide"));
  assert.ok(runtime.includes('reversalTransition'));
  assert.ok(runtime.includes("gated.side=operationalSide"));
  assert.ok(!runtime.includes('operationalSide!==rawSide'));
});

test('Overlay keeps asset switching simple and exposes only the validated asset plus instruction', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('ATIVO VALIDADO · '));
  assert.ok(ui.includes('feche o ativo atual e abra o novo pelo botão + da corretora'));
  assert.ok(!ui.includes('VALIDANDO NOVO ATIVO'));
  assert.ok(!ui.includes('aguardando nome + active_id + feed do mesmo ativo'));
  assert.ok(ui.includes('PROJEÇÃO FUTURA DAS ESTRATÉGIAS'));
});


test('Legacy analysis snapshots are never rebuilt into the clean calibration epoch', async () => {
  const runtime = await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url), 'utf8');
  const start=runtime.indexOf('  _bootstrapSignalValidation(){');
  const end=runtime.indexOf('\n  _settleDue(now){',start);
  const block=runtime.slice(start,end);
  assert.ok(block.includes('never reconstructed into statistical confidence samples'));
  assert.ok(!block.includes('this.signalValidation.outcomes.push'));
});

test('An unvalidated clicked tab makes the broker feed fail closed even if old candles stay healthy', () => {
  const d=new LocalPlaywrightDriver({dataDir:'sentinel-trading-lab/agent/worker/data/test-unvalidated-fail-closed'});
  const st=d.state('iq_option');
  st.balance=10000;st.mode='demo';st.symbol='EUR/USD OTC';st.uiSymbol='EUR/USD OTC';st.activeId=76;st.candleActiveId=76;
  const now=Math.floor(Date.now()/1000);
  st.candles=Array.from({length:60},(_,i)=>({from:now-(60-i)*60,to:now-(59-i)*60,open:1.1,high:1.101,low:1.099,close:1.1,volume:1}));
  st.quote=1.1;st.lastQuoteAt=Date.now();st.lastCandleAt=Date.now();
  st.screenCandidateSymbol='GBP/CAD OTC';
  const live=d.liveStatus('iq_option');
  assert.equal(live.assetValidated,false);
  assert.equal(live.feedValidated,false);
  assert.equal(live.marketStatus,'unvalidated');
  assert.match(live.marketReason,/não validado/i);
});


test('Unvalidated broker tab clears any locked future decision immediately', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes('const plannerReadable=!assetJustChanged&&!analysisStale&&liveNow'));
  assert.ok(ui.includes('localStorage.removeItem(decisionKey);localStorage.removeItem(expiredKey)'));
  assert.ok(ui.includes('const futureDecision=plannerReadable&&runtimeContextMatches'));
});


test('Operational entry uses the user threshold and points filter without hidden duplicate gates', async () => {
  const runtime = await readFile(new URL('../sentinel-trading-lab/agent/src/core/runtime.mjs', import.meta.url), 'utf8');
  assert.ok(runtime.includes('futureDisplayThreshold:70'));
  assert.ok(runtime.includes('(this._entryAnalysisMode||futureLead>=futureThreshold)&&decisionStrength>=signalPoints'));
  assert.ok(runtime.includes("timingConfirmed=reversal?(sustainedTrigger"));
  assert.ok(runtime.includes("_confirmPriceTrigger"));
  assert.ok(!runtime.includes('futureConfidence>=64'));
  assert.ok(!runtime.includes('futureAgreement>=58'));
  assert.ok(!runtime.includes('(strategySupport||strongSoloFuture)'));
  assert.ok(!runtime.includes('decisionStrength>=64&&futureEdge>=16'));
});

test('Overlay default footprint is smaller without reducing typography', async () => {
  const ui = await readFile(new URL('../sentinel-trading-lab/agent/worker/local-playwright-driver.mjs', import.meta.url), 'utf8');
  assert.ok(ui.includes("width:'500px',height:'min(560px"));
  assert.ok(ui.includes("minWidth:'420px'"));
  assert.ok(ui.includes("sentinel-overlay-size-v13r2"));
  assert.ok(ui.includes("fontSize:'13px'"));
});
