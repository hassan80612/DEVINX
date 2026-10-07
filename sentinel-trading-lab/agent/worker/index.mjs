import http from 'node:http';
import {readFile,writeFile,mkdir,rename,chmod} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DemoTradingRuntime} from '../src/core/runtime.mjs';
import {EncryptedSessionVault} from './session-vault.mjs';
import {HttpBrowserDriver} from './browser-driver.mjs';
import {LocalPlaywrightDriver} from './local-playwright-driver.mjs';
import {IqOptionAdapter} from './adapters/iq-option.mjs';
import {ExnovaAdapter} from './adapters/exnova.mjs';
import {SentinelRemoteRelay} from './remote-relay.mjs';
import {MarketJournal} from './market-journal.mjs';

const VERSION='13.4.8';
const HOST=process.env.SENTINEL_WORKER_HOST||'127.0.0.1';
const PORT=Number(process.env.SENTINEL_WORKER_PORT||8787);
const TOKEN=process.env.SENTINEL_WORKER_TOKEN||'';
const STATE_FILE=resolve(process.env.SENTINEL_STATE_FILE||'worker/data/state.json');
const VAULT_FILE=resolve(process.env.SENTINEL_SESSION_VAULT_FILE||'worker/data/broker-sessions.json.enc');
const SECRET_FILE=resolve(process.env.SENTINEL_LOCAL_SECRET_FILE||'worker/data/local-agent.secret');
if(HOST!=='127.0.0.1'&&HOST!=='localhost'&&!TOKEN)throw new Error('SENTINEL_WORKER_TOKEN is required when exposing worker beyond loopback');

const marketJournal=new MarketJournal({directory:resolve(dirname(STATE_FILE),'market-history')});
let journalAnalysisAt=0;
setInterval(()=>marketJournal.flush(),2000).unref();
const runtime=new DemoTradingRuntime({seed:Number(process.env.SENTINEL_DEMO_SEED||20261002),balance:Number(process.env.SENTINEL_DEMO_BALANCE||10000)});
const driver=process.env.SENTINEL_BROWSER_DRIVER_URL?new HttpBrowserDriver({baseUrl:process.env.SENTINEL_BROWSER_DRIVER_URL,token:process.env.SENTINEL_BROWSER_DRIVER_TOKEN||''}):new LocalPlaywrightDriver({dataDir:process.env.SENTINEL_BROWSER_PROFILE_DIR||'worker/data/browser-profiles'});
const brokers={iq_option:new IqOptionAdapter({driver}),exnova:new ExnovaAdapter({driver})};
const loginStates={iq_option:null,exnova:null};
let activeProvider=null;
function chooseLive(){
  if(activeProvider){
    const activePeek=driver.peek?.(activeProvider);
    if(activePeek?.updatedAt&&activePeek.open===false)activeProvider=null
  }
  const order=activeProvider?[activeProvider,...['iq_option','exnova'].filter(x=>x!==activeProvider)]:['iq_option','exnova'];
  for(const k of order){
    const b=brokers[k],peek=driver.peek?.(k),m=driver.liveStatus?.(k);
    if(peek?.updatedAt&&peek.open===false)continue;
    if(b?.connected&&m&&(m.balance!=null||m.quote!=null||m.candles?.length)){
      if(activeProvider!==k)activeProvider=k;
      return{k,m}
    }
  }
  return null
}
function syncRuntimeMarket(){const live=chooseLive();if(!live){runtime.setExternalMarket?.(null);runtime.setExecutionBroker?.(null);return null}const {k,m}=live;const status=String(m.marketStatus||'').toLowerCase(),unresolvedSwitch=status==='switching'&&!m.validatedSymbol&&!m.symbol;const screenSymbol=m.validatedSymbol||m.symbol||m.uiSymbol||(unresolvedSwitch?'':runtime.settings.asset),brokerMode=String(m.mode||'').toLowerCase();runtime.setExternalMarket?.({provider:k,source:`${k==='exnova'?'EXNOVA':'IQ OPTION'} LIVE`,balance:m.balance,quote:m.quote,candles:m.candles,quoteHistory:m.quoteHistory||[],brokerMode:m.mode,symbol:screenSymbol,activeId:m.activeId,feedValidated:m.feedValidated,assetValidated:m.assetValidated,validatedSymbol:m.validatedSymbol||m.symbol,screenCandidateSymbol:m.screenCandidateSymbol||null,validatedAt:m.validatedAt||null,executionReady:m.executionReady,protocol:m.protocol,lastQuoteAt:m.lastQuoteAt,lastCandleAt:m.lastCandleAt,latestCandleTs:m.latestCandleTs,candleFresh:m.candleFresh,candleAgeMs:m.candleAgeMs,marketStatus:m.marketStatus,marketReason:m.marketReason,uiSymbol:m.uiSymbol,suggestedSymbol:m.suggestedSymbol,lastCandleRequest:m.lastCandleRequest,lastCandleResponse:m.lastCandleResponse,expirationDurationMs:m.expirationDurationMs,expirationRaw:m.expirationRaw,expirationKind:m.expirationKind,expirationConfidence:m.expirationConfidence,expirationUpdatedAt:m.expirationUpdatedAt,payout:Number.isFinite(Number(m.payout))?Number(m.payout):null,quoteTs:m.lastQuoteAt||m.lastCandleAt||0});runtime.setExecutionBroker?.(brokers[k]);marketJournal.market(runtime.externalMarket,runtime.settings);if(screenSymbol)runtime.settings.asset=screenSymbol;if(['demo','real'].includes(brokerMode)&&runtime.settings.mode!==brokerMode)runtime.setMode(brokerMode,'broker');return live}
async function localSecret(){if(process.env.BROKER_SESSION_ENCRYPTION_KEY)return process.env.BROKER_SESSION_ENCRYPTION_KEY;try{return(await readFile(SECRET_FILE,'utf8')).trim()}catch(e){if(e?.code!=='ENOENT')throw e}await mkdir(dirname(SECRET_FILE),{recursive:true});const secret=randomBytes(32).toString('base64url');await writeFile(SECRET_FILE,secret,{encoding:'utf8',mode:0o600});await chmod(SECRET_FILE,0o600).catch(()=>{});return secret}
const vault=new EncryptedSessionVault({secret:await localSecret(),file:VAULT_FILE});await vault.load();for(const [name,adapter] of Object.entries(brokers))adapter.attachSessionRef(vault.get(name));
const remoteRelay=new SentinelRemoteRelay({version:VERSION});await remoteRelay.init();
let localCockpitLeaseUntil=0;
const localCockpitLeaseValid=()=>Date.now()<localCockpitLeaseUntil&&!!activeProvider&&brokers[activeProvider]?.connected===true;
let realtimeKick=null,lastRealtimeEvalAt=0,lastBrokerMaintainAt=0,lastOverlayAt=0,lastOverlayTimingKey='',lastPersistAt=0,lastMarketSyncAt=0;
driver.setMarketUpdateHandler?.((provider,event={})=>{
  if(provider!==activeProvider)return;
  // Troca de ativo é uma barreira forte: sincronize o runtime imediatamente para
  // invalidar níveis/percentuais do ativo anterior antes de qualquer nova análise.
  if(event?.assetChanged===true){
    syncRuntimeMarket();
    lastRealtimeEvalAt=0;
    runtime.requestImmediateEvaluation?.();
    if(runtime.stateName!=='running')return;
  }else if(runtime.stateName!=='running')return;
  const now=Date.now();
  if(now-lastRealtimeEvalAt<500)return;
  lastRealtimeEvalAt=now;
  runtime.requestImmediateEvaluation?.();
  if(realtimeKick)return;
  realtimeKick=setTimeout(()=>{
    realtimeKick=null;
    // Evaluate the quote that caused this event, not the previous 700ms snapshot.
    syncRuntimeMarket();lastMarketSyncAt=Date.now();
    loop().catch(()=>{});
  },100);
});
async function ensureLocalCockpitBroker(provider){
  assertLicensedAccess();
  const adapter=brokers[provider];if(!adapter)throw new Error('Corretora não suportada.');
  activeProvider=provider;
  let info=await driver.sessionInfo?.(provider).catch(()=>null);
  if(!info?.open){
    info=await driver.call(provider,'resume-visible',{body:{startup:false}}).catch(()=>null);
    if(!info?.open)throw new Error('Não foi possível abrir a corretora.');
  }
  if(!adapter.connected){
    await driver.call(provider,'connect',{body:{sessionRef:adapter.sessionRef||null,accountMode:'auto'}});
    adapter.connected=true;adapter._step?.('session',true,'sessão local conectada pelo card');
  }
  await driver.maintain?.(provider).catch(()=>{});
  adapter.refreshFromLive?.();
  const live=syncRuntimeMarket();
  if(!live)throw new Error('Aguardando leitura do ativo atual.');
  return live
}
driver.setOverlayActionHandler?.(async(provider,payload={})=>{
  const action=String(payload.action||'');
  if(!['pause','stop'].includes(action))assertLicensedAccess();
  if(action==='start'){
    localCockpitLeaseUntil=Date.now()+12*60*60*1000;
    await ensureLocalCockpitBroker(provider);
    const live=syncRuntimeMarket(),mode=String(live?.m?.mode||live?.mode||driver.liveStatus?.(provider)?.mode||'').toLowerCase();
    runtime.patchSettings({demoAutopilot:true},'overlay');
    await runtime.start('overlay');
    runtime.requestImmediateEvaluation?.();
    await saveState();
    return{ok:true,message:'Sentinel iniciado · piloto armado'}
  }
  if(action==='refresh'){localCockpitLeaseUntil=Date.now()+12*60*60*1000;activeProvider=provider;const adapter=brokers[provider];await driver.maintain?.(provider).catch(()=>{});await driver.requestBaseData?.(provider).catch(()=>{});await driver.requestMarketData?.(provider,{force:true}).catch(()=>{});adapter?.refreshFromLive?.();syncRuntimeMarket();runtime.requestImmediateEvaluation?.();await runtime.tick(Date.now()).catch(()=>{});return{ok:true,message:'Leitura atualizada'}}
  if(action==='pause'){localCockpitLeaseUntil=Date.now()+12*60*60*1000;activeProvider=provider;await runtime.pause('overlay');await saveState();return{ok:true,message:'Bot pausado'}}
  if(action==='stop'){localCockpitLeaseUntil=0;activeProvider=provider;runtime.patchSettings({demoAutopilot:false},'overlay');await runtime.stop('overlay','manual');await saveState();return{ok:true,message:'Bot parado e piloto desarmado'}}
  if(action==='setting'){
    localCockpitLeaseUntil=Date.now()+12*60*60*1000;
    const key=String(payload.key||''),value=payload.value;
    if(key==='strategy'||key==='strategy2'||key==='strategy3'){
      const allowed=['smart_confluence','price_action','trendline_breakout','support_resistance','fibonacci_retest','trend','mean_reversion','breakout'];
      const optional=key!=='strategy';
      if(!(optional&&String(value)==='none')&&!allowed.includes(String(value)))throw new Error('invalid_strategy');
      runtime.patchSettings({[key]:String(value)},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else if(key==='duration'){
      const n=Number(value);if(![30000,60000,120000,300000,600000,900000].includes(n))throw new Error('invalid_duration');
      runtime.patchSettings({orderDurationMs:n},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else if(key==='forecastHorizon'){
      const n=Math.round(Number(value));if(![30,60,120,300,600,900,3600].includes(n))throw new Error('invalid_forecast_horizon');
      runtime.patchSettings({forecastHorizonSeconds:n},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else if(key==='minConfidence'){
      const n=Math.round(Number(value));if(!Number.isFinite(n)||n<55||n>95)throw new Error('invalid_min_confidence');
      runtime.patchSettings({risk:{minConfidence:n}},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else if(key==='futureDisplayThreshold'){
      const n=Math.round(Number(value));if(!Number.isFinite(n)||n<50||n>95)throw new Error('invalid_future_threshold');
      runtime.patchSettings({futureDisplayThreshold:n},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else if(key==='readingPause'){
      const allowed=['market_confluence','market_entry','market_reversal','strategy_1','strategy_2','strategy_3'];
      const reading=String(payload.reading||'');if(!allowed.includes(reading))throw new Error('invalid_reading_pause');
      const paused=value===true||String(value)==='true';
      runtime.patchSettings({pausedReadings:{[reading]:paused}},'overlay');
      runtime.requestImmediateEvaluation?.();
    }else throw new Error('invalid_overlay_setting');
    await saveState();return{ok:true,message:'Configuração aplicada'}
  }
  throw new Error('invalid_overlay_action')
});
const ACCESS_LEASE_GRACE_MS=120000;
function accessLeaseValid(){return remoteRelay.info.paired===true&&remoteRelay.info.accessActive===true&&remoteRelay.info.lastContactAt!=null&&(Date.now()-Number(remoteRelay.info.lastContactAt))<=ACCESS_LEASE_GRACE_MS}
function assertLicensedAccess(){
  if(!remoteRelay.info.paired)throw new Error('agent_not_paired');
  if(remoteRelay.info.accessActive!==true)throw new Error(remoteRelay.info.accessReason||'agent_access_inactive');
  if(!accessLeaseValid())throw new Error('agent_access_unverified');
  return true
}
async function enforceAccessLease(){
  if(accessLeaseValid())return true;
  if(runtime.stateName==='running')await runtime.stop('system','agent_access_unverified');
  // V13.1: licença é da conta vinculada. Acesso local não contorna pagamento/expiração.
  return false;
}
async function loadState(){try{runtime.restore(JSON.parse(await readFile(STATE_FILE,'utf8')))}catch(e){if(e?.code!=='ENOENT')console.error('state_load_error',e)}}
async function saveState(){try{await mkdir(dirname(STATE_FILE),{recursive:true});const tmp=`${STATE_FILE}.tmp`;await writeFile(tmp,JSON.stringify(runtime.snapshotPersistent(),null,2));await rename(tmp,STATE_FILE)}catch(e){console.error('state_save_error',e)}}
await loadState();
async function bootstrapSavedBrokers(){
  if(!accessLeaseValid())return syncRuntimeMarket();
  const preferred=vault.get('iq_option')?'iq_option':vault.get('exnova')?'exnova':'iq_option';
  const order=[preferred,...Object.keys(brokers).filter(x=>x!==preferred)];
  for(const name of order){
    const adapter=brokers[name];if(!adapter)continue;
    if(name!==preferred&&!adapter.sessionRef)continue;
    try{
      const info=await driver.call(name,'resume-visible',{body:{startup:true}});
      loginStates[name]=info;activeProvider=name;
      if(info?.sessionPresent){
        const sessionRef=adapter.sessionRef||`local-profile:${name}`;
        if(!adapter.sessionRef){await vault.put(name,sessionRef);adapter.attachSessionRef(sessionRef)}
        await adapter.connect().catch(()=>{});
      }
      await driver.maintain?.(name).catch(()=>{});adapter.refreshFromLive?.();break
    }catch{}
  }
  syncRuntimeMarket()
}
setTimeout(()=>bootstrapSavedBrokers().catch(()=>{}),900).unref();
setTimeout(()=>{if(!activeProvider&&accessLeaseValid())bootstrapSavedBrokers().catch(()=>{})},3500).unref();
const overlayCache=new Map();
let overlayAssetKey='';
function overlayAnalysis(view,asset,now=Date.now()){
  const key=String(asset||'—').trim().toUpperCase(),switched=!!overlayAssetKey&&overlayAssetKey!==key;
  overlayAssetKey=key;
  const resultAsset=String(view.lastResult?.asset||view.lastResult?.analysis?.asset||'').trim().toUpperCase();
  const sameAsset=!!key&&!!resultAsset&&key===resultAsset;
  const current=sameAsset?(view.lastResult?.analysis||null):null;
  const complete=current&&current.metrics&&current.finalConfluence&&Number.isFinite(Number(current.confidence));
  if(complete){overlayCache.set(key,{analysis:current,at:now});return{analysis:current,transient:false}}
  if(!switched){const cached=overlayCache.get(key);if(cached&&now-Number(cached.at||0)<=2200)return{analysis:cached.analysis,transient:true}}
  return{analysis:current||{},transient:false}
}
const brokerMaintenancePending=new Set();
function scheduleBrokerMaintenance(provider){if(brokerMaintenancePending.has(provider))return;brokerMaintenancePending.add(provider);Promise.resolve(driver.maintain?.(provider)).then(()=>brokers[provider]?.refreshFromLive?.()).catch(()=>{}).finally(()=>brokerMaintenancePending.delete(provider))}
let busy=false;async function loop(){if(busy)return;busy=true;try{
  const licensed=await enforceAccessLease();
  if(!licensed){if(Date.now()-lastPersistAt>=5000){lastPersistAt=Date.now();await saveState()}return}
  if(activeProvider){
    const activePeek=driver.peek?.(activeProvider);
    if(activePeek?.updatedAt&&activePeek.open===false){
      if(brokers[activeProvider])brokers[activeProvider].connected=false;
      activeProvider=null;lastBrokerMaintainAt=0;lastMarketSyncAt=0;lastOverlayAt=0
    }
  }
  if(activeProvider&&brokers[activeProvider]?.connected&&Date.now()-lastBrokerMaintainAt>=2500){lastBrokerMaintainAt=Date.now();scheduleBrokerMaintenance(activeProvider)}
  const loopNow=Date.now();if(!lastMarketSyncAt||loopNow-lastMarketSyncAt>=700){lastMarketSyncAt=loopNow;syncRuntimeMarket()}
  await runtime.tick(loopNow);
  if(runtime.lastEvalMs!==journalAnalysisAt){journalAnalysisAt=runtime.lastEvalMs;marketJournal.analysis(runtime.lastResult?.analysis,runtime.settings.asset,journalAnalysisAt);for(const event of runtime.forecastResearch.drain())marketJournal.enqueue(event)}
  if(activeProvider){
    const view=await runtime.status();
    const brokerSwitching=String(view.liveBroker?.marketStatus||'').toLowerCase()==='switching'&&!view.liveBroker?.uiSymbol&&!view.liveBroker?.symbol;
    const currentAsset=brokerSwitching?'SINCRONIZANDO':(view.liveBroker?.uiSymbol||view.liveBroker?.symbol||view.settings?.asset||'—');
    const held=overlayAnalysis(view,currentAsset),a=held.analysis||{},m=a.metrics||{};
    const next=view.nextEvalMs?new Date(view.nextEvalMs).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
    const liveTs=Math.max(Number(view.liveBroker?.lastQuoteAt||0),Number(view.liveBroker?.lastCandleAt||0),Number(view.feed?.quoteTs||0));
    const op=a.operationalSignal||{},overlayTimingKey=[currentAsset,op.createdAt,op.side,op.state,op.ready,op.actionable,op.activeUntil].join('|');
    if(overlayTimingKey!==lastOverlayTimingKey||Date.now()-lastOverlayAt>=1000){
      lastOverlayTimingKey=overlayTimingKey;
      lastOverlayAt=Date.now();
    await driver.updateOverlay?.(activeProvider,{
      asset:currentAsset,
      validatedAsset:view.liveBroker?.validatedSymbol||view.liveBroker?.symbol||currentAsset,
      assetValidated:view.liveBroker?.assetValidated===true,
      screenCandidateSymbol:view.liveBroker?.screenCandidateSymbol||null,
      marketStatus:view.liveBroker?.marketStatus||null,
      marketReason:view.liveBroker?.marketReason||null,
      strategy:view.settings?.strategy||'smart_confluence',
      strategy2:view.settings?.strategy2||'none',
      strategy3:view.settings?.strategy3||'none',
      strategyCards:a.strategyCards||[],
      strategyConfluence:a.strategyConfluence||null,
      generalConsensus:a.generalConsensus||null,
      operationalSignal:a.operationalSignal||null,
      brokerExpirationDurationMs:view.liveBroker?.expirationDurationMs??null,
      brokerExpirationRaw:view.liveBroker?.expirationRaw??null,
      brokerExpirationKind:view.liveBroker?.expirationKind??null,
      brokerExpirationConfidence:view.liveBroker?.expirationConfidence??0,
      side:a.side||'WAIT',
      confidence:a.confidence||0,
      forecast30:a.forecast30||null,
      finalConfluence:a.finalConfluence||null,
      entryPlanner:a.entryPlanner||null,
      quality:a.quality||view.signalValidation||null,
      minConfidence:view.settings?.risk?.minConfidence||74,
      futureDisplayThreshold:view.settings?.futureDisplayThreshold||70,
      pausedReadings:view.settings?.pausedReadings||{},
      reasons:a.reasons||view.lastResult?.reasons||[],
      metrics:m,
      plan:view.lastResult?.plan||{},
      nextEval:next,
      realtime:true,
      analysisTransient:held.transient,
      analysisStale:view.liveBroker?.feedValidated===false,
      liveAgeMs:liveTs>0?Math.max(0,Date.now()-liveTs):null,
      analysisAgeMs:view.lastEvalMs?Math.max(0,Date.now()-Number(view.lastEvalMs)):null,
      durationMs:view.settings?.orderDurationMs||60000,
      forecastHorizonSeconds:view.settings?.forecastHorizonSeconds||Math.round(Number(view.settings?.orderDurationMs||60000)/1000),
      intervalMs:view.settings?.schedule?.intervalMs||1000,
      brokerMode:view.liveBroker?.mode||view.mode,
      mode:view.mode,
      state:view.state,
      demoAutopilot:view.autopilot?.enabled===true,
      executionReady:view.autopilot?.eligible===true,
      agentVersion:VERSION
    }).catch(()=>{});
    }
  }
  if(Date.now()-lastPersistAt>=5000){lastPersistAt=Date.now();await saveState()}
}catch(e){console.error('worker_loop_error',e)}finally{busy=false}}setInterval(loop,400).unref();
function brokerStatuses(){return Object.fromEntries(Object.entries(brokers).map(([k,v])=>[k,{...v.status(),marketData:driver.liveStatus?.(k)||null}]))}
async function status(){if(activeProvider&&brokers[activeProvider]?.connected)brokers[activeProvider].refreshFromLive?.();const chosen=syncRuntimeMarket();const base=await runtime.status();const provider=chosen?.k||null,live=chosen?.m||null;
  return{...base,marketJournal:marketJournal.status(),agentVersion:VERSION,remoteRelay:{...remoteRelay.info},runtimeKind:'persistent-worker',browserDriver:{configured:driver.available,type:driver instanceof LocalPlaywrightDriver?'system-browser-playwright':'remote-http'},sessionVault:{configured:true},brokers:brokerStatuses(),loginStates:{iq_option:driver.peek?.('iq_option')||loginStates.iq_option,exnova:driver.peek?.('exnova')||loginStates.exnova},activeProvider:provider,liveBroker:provider?{provider,...live}:null,...(live?.balance!=null?{balance:live.balance,balanceSource:'broker'}:{}),...(live?.quote!=null?{feed:{label:`${provider==='exnova'?'EXNOVA':'IQ OPTION'} LIVE`,price:live.quote,quoteTs:live.lastQuoteAt||live.lastCandleAt||0}}:{})}}
const DEFAULT_ALLOWED_ORIGINS=['https://sentinel-trading-lab.vercel.app','https://sentinel-trading-lab-iguassu-shop.vercel.app'];
const EXTRA=(process.env.SENTINEL_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);const ALLOWED_ORIGINS=new Set([...DEFAULT_ALLOWED_ORIGINS,...EXTRA]);
function allowedOrigin(origin=''){
  if(origin===''||origin==='http://localhost:3000'||origin==='http://127.0.0.1:3000')return true;
  if(ALLOWED_ORIGINS.has(origin))return true;
  return false;
}
function cors(req){const origin=String(req.headers.origin||'');const h={'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'600','cache-control':'no-store','vary':'Origin'};if(allowedOrigin(origin))h['access-control-allow-origin']=origin||'*';if(req.headers['access-control-request-private-network']==='true')h['access-control-allow-private-network']='true';return h}
function json(req,res,statusCode,data){res.writeHead(statusCode,{'content-type':'application/json; charset=utf-8',...cors(req)});res.end(JSON.stringify(data))}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536)throw new Error('body_too_large')}return raw?JSON.parse(raw):{}}
function authorized(req){if(!TOKEN)return true;return(req.headers.authorization||'')===`Bearer ${TOKEN}`}
function providerFromPath(path){const m=path.match(/^\/brokers\/(iq_option|exnova)(?:\/(.+))?$/);return m?{name:m[1],action:m[2]||''}:null}
function requiresAccess(path){
  if(path==='/status'||path==='/control/stop'||path==='/control/kill')return false;
  return path==='/control/start'||path==='/mode'||path==='/settings'||path.startsWith('/brokers/');
}
function ensureAccess(path,{local=false}={}){
  if(!requiresAccess(path))return;
  assertLicensedAccess();
}
async function act(path,method,payload,ctx={}){ensureAccess(path,ctx);if(path==='/status'&&method==='GET')return status();if(path==='/research'&&method==='GET')return{summary:runtime.forecastResearch.summary(),journal:marketJournal.status(),outcomes:runtime.forecastResearch.outcomes.slice(-100)};if(path==='/control/start'&&method==='POST'){if(activeProvider&&brokers[activeProvider]?.connected){await driver.maintain?.(activeProvider).catch(()=>{});brokers[activeProvider].refreshFromLive?.()}syncRuntimeMarket();return runtime.start(payload.actor||'user')};if(path==='/control/pause'&&method==='POST')return runtime.pause(payload.actor||'user');if(path==='/control/stop'&&method==='POST')return runtime.stop(payload.actor||'user',payload.reason||'manual');if(path==='/control/kill'&&method==='POST')return runtime.kill(payload.actor||'user');if(path==='/control/reset-kill'&&method==='POST')return runtime.resetKill(payload.actor||'master');if(path==='/control/freeze'&&method==='POST')return runtime.freeze(payload.actor||'master');if(path==='/control/unfreeze'&&method==='POST')return runtime.unfreeze(payload.actor||'master');if(path==='/control/clear-error'&&method==='POST')return runtime.clearExecutionError(payload.actor||'master');if(path==='/mode'&&method==='POST')return runtime.setMode(payload.mode,payload.actor||'user');if(path==='/settings'&&method==='PATCH')return runtime.patchSettings(payload,payload.actor||'user');if(path==='/tick'&&method==='POST'){await runtime.tick(Number(payload.now||Date.now()));return status()}if(path==='/brokers'&&method==='GET')return status();
  const p=providerFromPath(path);if(p){const adapter=brokers[p.name];if(p.action==='status'&&method==='GET')return{broker:{...adapter.status(),marketData:driver.liveStatus?.(p.name)||null},login:driver.peek?.(p.name)||loginStates[p.name]};if(p.action==='login'&&method==='POST'){
    loginStates[p.name]={provider:p.name,open:true,phase:'opening',updatedAt:new Date().toISOString()};
    try{
      const info=await withTimeout(driver.call(p.name,'login',{body:{accountMode:'auto',userInitiated:payload.userInitiated===true}}),28000,'broker_open_timeout');
      loginStates[p.name]=info;
      if(!info?.open)throw new Error(info?.error||'broker_window_not_open');
      return status()
    }catch(e){
      const err=String(e?.message||e);
      loginStates[p.name]={provider:p.name,open:false,phase:'open-error',error:err,updatedAt:new Date().toISOString()};
      throw new Error(err)
    }
  }if(p.action==='session-check'&&method==='POST'){const info=await driver.call(p.name,'session',{method:'GET'});loginStates[p.name]=info;if(!info.sessionPresent)throw new Error('session_not_detected_yet');const sessionRef=`local-profile:${p.name}`;await vault.put(p.name,sessionRef);adapter.attachSessionRef(sessionRef);await driver.call(p.name,'background',{method:'POST'}).catch(()=>{});await adapter.connect();if(adapter.connected)activeProvider=p.name;syncRuntimeMarket();return status()}if(p.action==='connect'&&method==='POST'){await adapter.connect();activeProvider=p.name;syncRuntimeMarket();return status()}if(p.action==='validate-market'&&method==='POST'){try{await adapter.validateReadOnly()}catch(e){adapter.lastError=String(e?.message||e)}return status()}if(p.action==='disconnect'&&method==='POST'){await adapter.disconnect();loginStates[p.name]=null;if(activeProvider===p.name)activeProvider=null;syncRuntimeMarket();return status()}if(p.action==='session-ref'&&method==='POST'){await vault.put(p.name,payload.sessionRef);adapter.attachSessionRef(vault.get(p.name));return status()}if(p.action==='session-ref'&&method==='DELETE'){await vault.remove(p.name);adapter.attachSessionRef(null);return status()}if(p.action==='validate-demo-order'&&method==='POST')return adapter.validateDemoOrder()}
  const err=new Error('not_found');err.status=404;throw err}

let autoBrokerBusy=false;
async function autoConnectVisibleBrokers(){
  if(autoBrokerBusy||!accessLeaseValid())return;autoBrokerBusy=true;
  try{
    for(const [name,adapter] of Object.entries(brokers)){
      const peek=driver.peek?.(name);
      if(adapter.connected){
        if(!activeProvider&&peek?.open){activeProvider=name;syncRuntimeMarket()}
        continue
      }
      if(!peek?.open)continue;
      let info=null;
      try{
        info=await withTimeout(driver.sessionInfo(name),5000,'broker_session_probe_timeout');
        loginStates[name]=info;
      }catch{continue}
      if(!info?.sessionPresent)continue;
      const sessionRef=`local-profile:${name}`;
      try{
        if(vault.get(name)!==sessionRef)await vault.put(name,sessionRef);
        if(adapter.sessionRef!==sessionRef)adapter.attachSessionRef(sessionRef);
        await withTimeout(adapter.connect(),12000,'broker_auto_connect_timeout');
        if(adapter.connected){
          activeProvider=name;
          syncRuntimeMarket();
        }
      }catch{}
    }
  }finally{autoBrokerBusy=false}
}
setInterval(()=>autoConnectVisibleBrokers().catch(()=>{}),2500).unref();
setTimeout(()=>autoConnectVisibleBrokers().catch(()=>{}),1200).unref();

async function withTimeout(promise,ms,label='operation_timeout'){
  let timer;
  try{
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms)})
    ])
  }finally{clearTimeout(timer)}
}
let remoteBusy=false;
async function remoteState(){
  const x=await status();
  return {agentVersion:VERSION,agentAccess:{paired:remoteRelay.info.paired,active:remoteRelay.info.accessActive,reason:remoteRelay.info.accessReason},remoteRelay:{lastContactAt:remoteRelay.info.lastContactAt,lastError:remoteRelay.info.lastError},browserDriver:x.browserDriver,loginStates:x.loginStates,state:x.state,mode:x.mode,balance:x.balance,balanceSource:x.balanceSource,feed:x.feed,analysisSource:x.analysisSource,executionMode:x.executionMode,lastResult:x.lastResult,lastEvalMs:x.lastEvalMs,nextEvalMs:x.nextEvalMs,recentAnalyses:x.recentAnalyses,research:x.research,marketJournal:x.marketJournal,incidents:x.incidents,drawdownPct:x.drawdownPct,consecutiveLosses:x.consecutiveLosses,pending:x.pending,wins:x.wins,losses:x.losses,winRate:x.winRate,settings:x.settings,pnl:x.pnl,trades:x.trades,recentTrades:x.recentTrades,liveBroker:x.liveBroker,activeProvider:x.activeProvider,brokers:x.brokers,startBlockedReason:x.startBlockedReason,killSwitch:x.killSwitch,masterFrozen:x.masterFrozen,scheduler:x.scheduler||x.schedule};
}
async function remoteLoop(){
  if(remoteBusy)return;remoteBusy=true;
  try{
    if(!remoteRelay.info.deviceId)await remoteRelay.register();
    const hb=await remoteRelay.heartbeat(await remoteState());
    if(hb&&hb.accessActive===false)await enforceAccessLease();
    const polled=await remoteRelay.poll();const cmd=polled?.command;
    if(cmd?.id&&cmd?.type){
      try{
        const method=cmd.type==='settings'?'PATCH':'POST';
        const data=await withTimeout(act('/'+cmd.type,method,cmd.payload||{}),28000,'agent_command_timeout');
        await saveState();
        await remoteRelay.ack(cmd.id,true,{ok:true,state:data?.state||null,mode:data?.mode||null,strategy:data?.settings?.strategy||null,activeProvider:data?.activeProvider||null,loginStates:data?.loginStates||null})
      }catch(e){
        await remoteRelay.ack(cmd.id,false,{error:String(e?.message||e).slice(0,180)}).catch(()=>{})
      }
    }
  }catch(e){
    remoteRelay.info.lastError=String(e?.message||e);
    const last=Number(remoteRelay.info.lastContactAt||0);
    if(last>0&&Date.now()-last>ACCESS_LEASE_GRACE_MS){
      remoteRelay.info.accessActive=false;
      remoteRelay.info.accessReason='license_check_unavailable';
      if(runtime.stateName==='running'){
        await runtime.stop('system','agent_license_check_unavailable').catch(()=>{});
      }
    }
  }finally{remoteBusy=false}
}
setInterval(remoteLoop,1500).unref();setTimeout(remoteLoop,350).unref();

const server=http.createServer(async(req,res)=>{try{if(req.method==='OPTIONS'){res.writeHead(204,cors(req));return res.end()}const origin=String(req.headers.origin||'');if(origin&&!allowedOrigin(origin))return json(req,res,403,{ok:false,error:'origin_not_allowed'});const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(url.pathname==='/health')return json(req,res,200,{ok:true,service:'sentinel-worker',version:VERSION,runtimeKind:'persistent-worker',driverConfigured:driver.available,vaultConfigured:true,remoteRelay:{...remoteRelay.info},ts:new Date().toISOString()});if(url.pathname==='/remote-info')return json(req,res,200,{ok:true,...remoteRelay.info,version:VERSION});if(!authorized(req))return json(req,res,401,{ok:false,error:'unauthorized'});const payload=['POST','PATCH','PUT','DELETE'].includes(req.method||'')?await body(req):{};const addr=String(req.socket?.remoteAddress||'');const local=addr==='127.0.0.1'||addr==='::1'||addr==='::ffff:127.0.0.1';const data=await act(url.pathname,req.method||'GET',payload,{local});await saveState();return json(req,res,200,{ok:true,data})}catch(e){return json(req,res,Number(e?.status||400),{ok:false,error:String(e?.message||e)})}});
server.listen(PORT,HOST,()=>console.log(`Sentinel worker v${VERSION} listening on http://${HOST}:${PORT}`));process.on('SIGTERM',async()=>{await saveState();await marketJournal.flush();server.close(()=>process.exit(0))});process.on('SIGINT',async()=>{await saveState();await marketJournal.flush();server.close(()=>process.exit(0))});
