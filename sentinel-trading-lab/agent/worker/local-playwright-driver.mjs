import {mkdir,rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {QuadcodeFeed} from './quadcode-feed.mjs';

const PROVIDERS={
  iq_option:{url:'https://iqoption.com/pt',tradeUrl:'https://iqoption.com/traderoom',domain:'iqoption.com',wsDomain:'iqoption.com',label:'IQ Option'},
  exnova:{url:'https://exnova.com/pt/',tradeUrl:'https://exnova.com/traderoom',domain:'exnova.com',wsDomain:'ws.trade.exnova.com',label:'Exnova'}
};
const OTC_PREFERRED=['EUR/USD OTC','GBP/USD OTC','EUR/GBP OTC','USD/CHF OTC','EUR/JPY OTC','AUD/USD OTC','USD/CAD OTC','GBP/JPY OTC','XAU/USD OTC','ETH/USD OTC'];

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function focusProcess(pid){
  if(process.platform!=='win32'||!pid)return;
  try{
    const script=`Add-Type -AssemblyName Microsoft.VisualBasic; Start-Sleep -Milliseconds 250; [Microsoft.VisualBasic.Interaction]::AppActivate(${Number(pid)}) | Out-Null`;
    const p=spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',script],{windowsHide:true,stdio:'ignore'});
    p.unref?.();
  }catch{}
}
async function killSentinelProfileBrowsers(profileDir){
  if(process.platform!=='win32')return;
  const safe=String(profileDir||'').replace(/'/g,"''");
  if(!safe)return;
  await new Promise(resolveDone=>{
    const script=`$p='${safe}'; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'msedge.exe') -and $_.CommandLine -and $_.CommandLine -like ('*--user-data-dir='+$p+'*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const p=spawn('powershell.exe',['-NoProfile','-WindowStyle','Hidden','-Command',script],{windowsHide:true,stdio:'ignore'});
    p.on('exit',()=>resolveDone());p.on('error',()=>resolveDone());
  });
  for(const name of ['SingletonLock','SingletonCookie','SingletonSocket','lockfile']){
    await rm(join(profileDir,name),{force:true,recursive:true}).catch(()=>{});
  }
}
const nowIso=()=>new Date().toISOString();
const uniq=(arr)=>[...new Set(arr.filter(Boolean))];
function n(v){
  if(v==null||v==='')return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  let s=String(v).trim().replace(/\s/g,'').replace(/[^0-9+\-.,]/g,'');if(!s)return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0){if(comma>dot)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}
  else if(comma>=0)s=s.replace(',','.');
  const x=Number(s);return Number.isFinite(x)?x:null
}
const BAD_PAIR_TOKENS=new Set(['COM','GTM','WWW','HTTP','HTTPS','API','APP','ORG','NET','CDN','IMG','JS','CSS','ING']);
const PAIR_CODES=new Set(['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','BRL','TRY','ZAR','MXN','SGD','HKD','NOK','SEK','DKK','PLN','CZK','HUF','THB','BTC','ETH','XAU','XAG']);
function pairStrings(text=''){
  const t=String(text).toUpperCase();
  const raw=t.match(/\b[A-Z]{3}\s*[/\-]\s*[A-Z]{3}(?:\s*\(?OTC\)?)?/g)||[];
  const compact=t.match(/\b[A-Z]{6}(?:-OTC)?\b/g)||[];
  const a=raw.map(x=>x.replace(/\s+/g,' ').trim().replace('-', '/').replace(/\s*\(?OTC\)?$/,' OTC'));
  const b=compact.map(x=>{const otc=x.endsWith('-OTC'),z=x.replace(/-OTC$/,'');return `${z.slice(0,3)}/${z.slice(3,6)}${otc?' OTC':''}`});
  return uniq([...a,...b].filter(x=>{const base=x.replace(/ OTC$/,'');const [q,r]=base.split('/');return q&&r&&!BAD_PAIR_TOKENS.has(q)&&!BAD_PAIR_TOKENS.has(r)&&(PAIR_CODES.has(q)||PAIR_CODES.has(r))}));
}
function pairKey(v=''){return String(v).toUpperCase().replace(/\s*\(?OTC\)?$/,'-OTC').replace(/[^A-Z]/g,'')}
function epochMs(v){const x=Number(v);if(!Number.isFinite(x)||x<=0)return null;if(x>1e17)return Math.round(x/1e6);if(x>1e14)return Math.round(x/1e3);if(x<1e12)return Math.round(x*1e3);return Math.round(x)}
function mergeCandles(a=[],b=[]){const m=new Map();for(const c of [...a,...b]){const x=candleOf(c);if(!x)continue;const k=String(x.from??x.to??`${x.open}:${x.close}:${m.size}`);m.set(k,x)}return [...m.values()].sort((x,y)=>Number(x.from||0)-Number(y.from||0)).slice(-600)}
function reqId(prefix='sentinel'){return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function findBrowser(){
  const env=process.env;const c=[];
  if(env.PROGRAMFILES)c.push(join(env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),join(env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'));
  if(env['PROGRAMFILES(X86)'])c.push(join(env['PROGRAMFILES(X86)'],'Google','Chrome','Application','chrome.exe'),join(env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'));
  if(env.LOCALAPPDATA)c.push(join(env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'),join(env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe'));
  return c;
}
async function exists(p){try{const fs=await import('node:fs/promises');await fs.access(p);return true}catch{return false}}
async function freePort(){return await new Promise((resolvePort,reject)=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const a=s.address();const p=typeof a==='object'&&a?a.port:0;s.close(()=>resolvePort(p))});s.on('error',reject)})}
function killProc(proc){try{if(proc&&!proc.killed)proc.kill()}catch{}}

function detectMode(text=''){
  const t=String(text).toLowerCase();
  if(/real account|conta real|saldo real|real balance|live account|actual account/.test(t))return 'real';
  if(/practice account|conta de prática|conta pratica|practice balance|saldo de prática|saldo pratica|demo account|conta demo|\bdemo\b|\bpractice\b|\bprática\b/.test(t))return 'demo';
  return null;
}
function bestBalanceFromText(text='',modeHint=null){
  const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,7000);
  let best=null;
  for(let i=0;i<lines.length;i++){
    const near=[lines[i-3],lines[i-2],lines[i-1],lines[i],lines[i+1],lines[i+2],lines[i+3]].filter(Boolean).join(' ');
    if(!/(saldo|balance|practice|prática|demo|conta|account|real)/i.test(near))continue;
    const localMode=detectMode(near);
    const ms=near.match(/(?:US\$|R\$|\$|€|£)?\s*[-+]?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|(?:US\$|R\$|\$|€|£)?\s*[-+]?\d+(?:[.,]\d{1,2})?/g)||[];
    for(const m of ms){const val=n(m);if(val==null||val<0||val>1e9)continue;let score=0;if(/saldo|balance/i.test(near))score+=10;if(/[\$€£]|US\$|R\$/i.test(m))score+=2;if(val>=1)score+=1;if(modeHint&&localMode===modeHint)score+=12;if(modeHint&&localMode&&localMode!==modeHint)score-=12;if(!modeHint&&localMode)score+=3;if(!best||score>best.score)best={value:val,score,raw:m,context:near.slice(0,260),mode:localMode}}
  }
  return best;
}
function inferObjectMode(obj,hint=''){
  const bits=[hint,obj?.mode,obj?.accountMode,obj?.account_mode,obj?.accountType,obj?.account_type,obj?.name,obj?.label].filter(v=>typeof v==='string').join(' ');
  if(obj?.isDemo===true||obj?.is_demo===true||obj?.practice===true)return 'demo';
  if(obj?.isReal===true||obj?.is_real===true)return 'real';
  const context=(hint+' '+Object.keys(obj||{}).join(' ')).toLowerCase();
  const balanceType=Number(obj?.balance_type??obj?.balanceType??((/balance|account|profile/.test(context))?obj?.type:NaN));
  if(balanceType===1)return 'real';
  if(balanceType===4)return 'demo';
  return detectMode(bits);
}
function candleOf(x){
  if(!x||typeof x!=='object')return null;
  const c={open:n(x.open??x.opening),close:n(x.close??x.closing??x.price),high:n(x.high??x.max??x.maximum),low:n(x.low??x.min??x.minimum),from:x.from??x.timestamp??x.time??x.at??null,to:x.to??null,volume:n(x.volume??x.vol??0)};
  return [c.open,c.close,c.high,c.low].every(v=>v!=null)?c:null;
}
function latestCandleAgeMs(st){
  const last=st?.candles?.at?.(-1)||null;
  const ts=epochMs(last?.to??last?.from);
  return ts==null?null:Math.max(0,Date.now()-ts);
}
function candleFreshForState(st){
  const age=latestCandleAgeMs(st);
  const windowMs=Math.max(180000,Number(st?.candleSize||60)*3000);
  return age!=null&&age<=windowMs;
}

function applyKnownBalance(st){
  const arr=Array.isArray(st.lastBalances)?st.lastBalances:[];if(!arr.length)return false;
  let selected=st.balanceId!=null?arr.find(x=>n(x?.id)===n(st.balanceId)):null;
  if(!selected&&st.mode)selected=arr.find(x=>(st.mode==='real'&&Number(x?.type)===1)||(st.mode==='demo'&&Number(x?.type)===4));
  const eligible=arr.filter(x=>[1,4].includes(Number(x?.type)));if(!selected&&eligible.length===1)selected=eligible[0];
  if(!selected)return false;const typ=Number(selected.type);if(typ===1)st.mode='real';if(typ===4)st.mode='demo';const id=n(selected.id);if(id!=null)st.balanceId=id;const val=n(selected.amount??selected.balance);if(val!=null){st.balance=val;st.balanceSource='protocol:balances';return true}return false
}
function protocolScan(data,st,direction='in'){
  if(!data||typeof data!=='object')return;
  const outer=String(data.name||data.event||'');
  const inner=String(data?.msg?.name||data?.message?.name||'');
  const body=data?.msg?.body||data?.msg?.params?.routingFilters||data?.body||data?.params?.routingFilters||{};
  const activeRaw=body?.active_id??body?.activeId??data?.msg?.active_id??data?.active_id;
  const sizeRaw=body?.size??body?.duration??data?.msg?.size??data?.msg?.duration;
  if(/page-out/.test(direction)&&activeRaw!=null){
    // active_id também aparece em mensagens de ordem CALL/PUT.
    // Saída da rede nunca redefine o ativo visível: a fonte de verdade é o DOM/clique da corretora.
    const aid=n(activeRaw);
    const currentKey=pairKey(st.uiSymbol||st.symbol||'');
    const mapped=aid!=null?[...st.activeMap.entries()].find(([,id])=>Number(id)===Number(aid))?.[0]||null:null;
    if(aid!=null&&(!currentKey||!mapped||mapped===currentKey))st.activeId=aid;
    const sz=n(sizeRaw);if(sz!=null&&sz>0&&sz<=86400)st.candleSize=sz
  }

  if(outer==='profile'&&data.msg&&typeof data.msg==='object'){
    const m=data.msg;const bid=n(m.balance_id??m.balanceId);if(bid!=null)st.balanceId=bid;
    let selected=null;const balances=Array.isArray(m.balances)?m.balances:[];
    const explicitType=Number(m.balance_type??m.balanceType);
    if(st.balanceId!=null)selected=balances.find(x=>n(x?.id)===n(st.balanceId))||null;
    if(!selected&&[1,4].includes(explicitType))selected=balances.find(x=>Number(x?.type)===explicitType)||null;
    const eligible=balances.filter(x=>[1,4].includes(Number(x?.type)));
    if(!selected&&eligible.length===1)selected=eligible[0];
    const typ=Number(selected?.type??([1,4].includes(explicitType)?explicitType:NaN));
    if(typ===1)st.mode='real';if(typ===4)st.mode='demo';
    const val=n(selected?.amount??((st.mode&&[1,4].includes(explicitType))?m.balance:null));if(val!=null){st.balance=val;st.balanceSource='protocol:profile'}else applyKnownBalance(st)
  }
  if(outer==='balances'){
    const arr=Array.isArray(data.msg)?data.msg:Array.isArray(data?.msg?.data)?data.msg.data:Array.isArray(data?.msg?.balances)?data.msg.balances:[];
    if(arr.length){st.lastBalances=arr.slice(0,50);applyKnownBalance(st)}
  }
  if(/balance-changed/i.test(outer)||/balance-changed/i.test(inner)){
    const m=(data.msg&&typeof data.msg==='object')?data.msg:data;const id=n(m.balance_id??m.balanceId??m.id);const typ=Number(m.type??m.balance_type??m.balanceType);const matchesKnown=st.balanceId!=null&&id!=null&&id===st.balanceId;const matchesMode=st.mode&&((st.mode==='real'&&typ===1)||(st.mode==='demo'&&typ===4));if(matchesKnown||matchesMode){if(typ===1)st.mode='real';if(typ===4)st.mode='demo';if(st.balanceId==null&&id!=null)st.balanceId=id;const val=n(m.amount??m.balance??m.current_balance??m.value);if(val!=null){st.balance=val;st.balanceSource='protocol:balance-changed'}}
  }
  if(outer==='candles'){
    const aid=n(data?.msg?.active_id??data?.msg?.activeId);
    const matches=aid==null||st.activeId==null||Number(aid)===Number(st.activeId);
    const arr=Array.isArray(data?.msg?.data)?data.msg.data:Array.isArray(data?.msg)?data.msg:[];
    if(matches&&arr.length){if(aid!=null)st.activeId=aid;st.candles=mergeCandles(st.candles,arr);st.lastCandleAt=Date.now();const last=st.candles.at(-1);if(last?.close!=null){st.quote=Number(last.close);st.lastQuoteAt=Date.now()}}
  }
  if(outer==='candle-generated'){
    const aid=n(data?.msg?.active_id??data?.msg?.activeId);
    const matches=aid==null||st.activeId==null||Number(aid)===Number(st.activeId);
    const candle=candleOf(data.msg);if(matches&&candle){if(aid!=null)st.activeId=aid;st.candles=mergeCandles(st.candles,[candle]);st.lastCandleAt=Date.now();st.quote=Number(candle.close);st.lastQuoteAt=Date.now();const sz=n(data?.msg?.size);if(sz!=null&&sz>0)st.candleSize=sz}
  }
}
function chooseCandidate(candidates=[],modeHint=null){
  if(!candidates.length)return null;
  if(!modeHint){const modes=uniq(candidates.map(c=>c.mode).filter(Boolean));if(modes.length>1)return null}
  let best=null;
  for(const c of candidates){let score=Number(c.score||0);if(modeHint&&c.mode===modeHint)score+=20;if(modeHint&&c.mode&&c.mode!==modeHint)score-=20;if(!best||score>best.score)best={...c,score}}
  return best;
}
function recursiveScan(obj,out,hint=''){
  if(obj==null)return;
  if(typeof obj==='string'){for(const p of pairStrings(obj))out.assets.add(p);return}
  if(typeof obj!=='object')return;
  if(Array.isArray(obj)){
    const candleLike=obj.map(candleOf).filter(Boolean);
    if(candleLike.length>=5)out.candles=mergeCandles(out.candles,candleLike);
    for(const v of obj.slice(0,2000))recursiveScan(v,out,hint);return;
  }
  const keys=Object.keys(obj),objectMode=inferObjectMode(obj,hint);
  if(objectMode){out.modeCandidates=out.modeCandidates||[];out.modeCandidates.push({mode:objectMode,score:/balance|account|profile/.test(hint)?12:6})}
  const localHint=(hint+' '+String(obj.name??obj.type??obj.event??obj.method??obj.action??obj.account_type??obj.accountMode??'')).toLowerCase();
  const ownPairs=uniq(keys.flatMap(k=>typeof obj[k]==='string'?pairStrings(obj[k]):[]));
  const possibleId=n(obj.active_id??obj.activeId??obj.instrument_active_id??obj.asset_id??((ownPairs.length||/active|instrument|asset|underlying/.test(localHint))?obj.id:null));
  if(possibleId!=null&&ownPairs.length){for(const p of ownPairs){out.activeMap.set(pairKey(p),possibleId);out.assets.add(p)}}
  for(const k of keys){const v=obj[k],kl=k.toLowerCase();
    if(typeof v==='string'){for(const p of pairStrings(v))out.assets.add(p)}
    if(/balance|equity/.test(kl)||(/amount|value/.test(kl)&&/balance|account|wallet|portfolio/.test(localHint))){const val=n(v);if(val!=null&&val>=0&&val<1e9){out.balanceCandidates.push({value:val,mode:objectMode,score:/balance/.test(kl)?8:/equity/.test(kl)?6:2,hint:localHint.slice(-180)})}}
    if(['symbol','ticker','instrument','asset','active'].includes(kl)&&typeof v==='string'){const ps=pairStrings(v);for(const p of ps)out.assets.add(p);if(ps[0])out.symbol=ps[0]}
    if(['price','quote','bid','ask','close','value'].includes(kl)&&/quote|instrument|candle|price|tick|active/.test(localHint)){const val=n(v);if(val!=null&&val>0&&val<1e8){out.quote=val;out.lastQuoteAt=Date.now()}}
  }
  const oneCandle=candleOf(obj);if(oneCandle){out.candles=mergeCandles(out.candles,[oneCandle]);out.lastCandleAt=Date.now()}
  for(const v of Object.values(obj))recursiveScan(v,out,localHint);
}

export class LocalPlaywrightDriver{
  constructor({dataDir='worker/data/browser-profiles-v85'}={}){this.dataDir=resolve(dataDir);this.sessions=new Map();this.last=new Map();this.live=new Map();this.feeds=new Map();this.opening=new Map();this.lastManualOpenAt=new Map();this.available=true;this.chromium=null;this.overlayActionHandler=null;this.marketUpdateHandler=null}
  setOverlayActionHandler(handler){this.overlayActionHandler=typeof handler==='function'?handler:null;return this}
  setMarketUpdateHandler(handler){this.marketUpdateHandler=typeof handler==='function'?handler:null;return this}
  config(provider){const c=PROVIDERS[provider];if(!c)throw new Error('unsupported_provider');return c}
  state(provider){if(!this.live.has(provider))this.live.set(provider,{balance:null,balanceId:null,balanceSource:null,lastBalances:[],assets:new Set(),activeMap:new Map(),activeId:null,quote:null,symbol:null,uiSymbol:null,lastUiSignalAt:null,uiSymbolSource:null,candles:[],quoteHistory:[],candleSize:60,lastFrameAt:null,lastDomAt:null,lastQuoteAt:null,lastCandleAt:null,lastRequestAt:null,lastMaintainAt:null,lastRecoveryAt:null,subscribedSymbol:null,subscribedActiveId:null,mode:null,protocol:'passive',directStatus:null,lastDirectError:null,lastCandleRequest:null,lastCandleResponse:null,suggestedSymbol:null,marketStatus:'unknown',marketReason:'Aguardando mercado',autoSelected:false,executionReady:false,executionUi:null});return this.live.get(provider)}
  async engine(){if(!this.chromium){const mod=await import('playwright-core');this.chromium=mod.chromium}return this.chromium}
  async browserPath(){for(const p of findBrowser())if(await exists(p))return p;throw new Error('chrome_or_edge_not_found')}
  async session(provider){if(!this.sessions.has(provider))this.sessions.set(provider,{provider,normal:null,cdp:null,browser:null,context:null,page:null,background:false,debugPort:null,profileDir:resolve(this.dataDir,provider)});return this.sessions.get(provider)}
  async launchNormal(provider,{manual=false}={}){
    const cfg=this.config(provider),s=await this.session(provider);await mkdir(s.profileDir,{recursive:true});
    if(!manual)throw new Error('broker_open_requires_manual_action');
    if(this.opening.has(provider))return this.opening.get(provider);
    const lastOpen=this.lastManualOpenAt.get(provider)||0;
    if(s.context&&s.page&&!s.background){
      try{
        const current=String(s.page.url()||'');
        if(!current.includes(cfg.domain))await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:30000});
        await s.page.bringToFront();
      }catch{}
      this.lastManualOpenAt.set(provider,Date.now());return s
    }
    if(s.context&&s.page&&s.background){
      try{await s.context.close()}catch{}
      s.browser=null;s.context=null;s.page=null;s.background=false;await sleep(350)
    }
    if(Date.now()-lastOpen<5000){const info=this.last.get(provider);if(info?.open)return s}
    const task=(async()=>{
      try{if(s.context)await s.context.close().catch(()=>{})}catch{}
      try{if(s.browser)await s.browser.close().catch(()=>{})}catch{}
      killProc(s.normal);s.normal=null;killProc(s.cdp);s.cdp=null;s.browser=null;s.context=null;s.page=null;s.background=false;
      await killSentinelProfileBrowsers(s.profileDir);await sleep(250);
      const exe=await this.browserPath();
      const chromium=await this.engine();
      let context;
      try{
        context=await chromium.launchPersistentContext(s.profileDir,{
          executablePath:exe,
          headless:false,
          viewport:null,
          chromiumSandbox:true,
          ignoreDefaultArgs:['--enable-automation'],
          args:[
            '--no-first-run','--no-default-browser-check','--start-maximized',
            '--window-position=70,50','--window-size=1360,900',
            '--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding',
            '--disable-blink-features=AutomationControlled'
          ]
        });
      }catch{
        this.last.set(provider,{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,phase:'browser-launch-error',error:'browser_launch_failed',updatedAt:nowIso()});
        throw new Error('browser_launch_failed');
      }
      s.context=context;
      s.browser=context.browser?.()||{close:()=>context.close()};
      s.background=false;
      const markClosed=()=>{if(s.context===context){s.browser=null;s.context=null;s.page=null;s.background=false;this.last.set(provider,{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,phase:'browser-closed',updatedAt:nowIso()})}};
      context.once?.('close',markClosed);
      let pages=context.pages();s.page=pages.find(p=>p.url().includes(cfg.domain))||pages[0]||await context.newPage();
      if(!String(s.page.url()||'').includes(cfg.domain))await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:30000});
      await this.installBridge(s.page,provider);this.attachNetwork(provider,s.page);
      try{await s.page.bringToFront()}catch{}
      this.lastManualOpenAt.set(provider,Date.now());
      const info=await this.sessionInfo(provider).catch(()=>null);
      if(!info?.open)this.last.set(provider,{provider,open:true,sessionPresent:false,likelyAuthenticated:false,url:s.page.url()||cfg.tradeUrl,title:cfg.label,cookieCount:0,phase:'login-required',updatedAt:nowIso()});
      return s;
    })();
    this.opening.set(provider,task);
    try{return await task}finally{setTimeout(()=>{if(this.opening.get(provider)===task)this.opening.delete(provider)},500)}
  }
  async launchBackground(provider,{force=false}={}){
    const cfg=this.config(provider),s=await this.session(provider);await mkdir(s.profileDir,{recursive:true});
    if(!force&&s.context&&s.page)return s;
    if(this.opening.has(provider))return this.opening.get(provider);
    const task=(async()=>{
      try{if(s.context)await s.context.close().catch(()=>{})}catch{}
      try{if(s.browser)await s.browser.close().catch(()=>{})}catch{}
      killProc(s.normal);s.normal=null;killProc(s.cdp);s.cdp=null;s.browser=null;s.context=null;s.page=null;s.background=false;
      await killSentinelProfileBrowsers(s.profileDir);await sleep(350);
      const exe=await this.browserPath();
      const chromium=await this.engine();
      let context;
      try{
        context=await chromium.launchPersistentContext(s.profileDir,{
          executablePath:exe,
          headless:true,
          viewport:{width:1280,height:900},
          chromiumSandbox:true,
          ignoreDefaultArgs:['--enable-automation'],
          args:['--no-first-run','--no-default-browser-check']
        });
      }catch{
        this.last.set(provider,{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,phase:'background-launch-error',error:'background_browser_launch_failed',updatedAt:nowIso()});
        throw new Error('background_browser_launch_failed');
      }
      s.context=context;
      s.browser=context.browser?.()||{close:()=>context.close()};
      s.background=true;
      const markClosed=()=>{if(s.context===context){s.browser=null;s.context=null;s.page=null;s.background=false;this.last.set(provider,{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,phase:'background-closed',updatedAt:nowIso()})}};
      context.once?.('close',markClosed);
      let pages=context.pages();s.page=pages.find(p=>p.url().includes(cfg.domain))||pages[0]||await context.newPage();
      if(!String(s.page.url()||'').includes(cfg.domain))await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:30000});
      await this.installBridge(s.page,provider);this.attachNetwork(provider,s.page);
      this.last.set(provider,{provider,open:true,sessionPresent:false,likelyAuthenticated:false,url:s.page.url()||cfg.tradeUrl,title:cfg.label,cookieCount:0,phase:'background-session',background:true,updatedAt:nowIso()});
      const info=await this.sessionInfo(provider);
      if(!info.sessionPresent){
        try{await context.close()}catch{}
        s.browser=null;s.context=null;s.page=null;s.background=false;
        throw new Error('broker_session_not_detected')
      }
      return s;
    })();
    this.opening.set(provider,task);
    try{return await task}finally{setTimeout(()=>{if(this.opening.get(provider)===task)this.opening.delete(provider)},500)}
  }
  async attachAutomation(provider,{manual=false}={}){
    const s=await this.session(provider);
    if(s.browser&&s.page)return s;
    if(manual)return this.launchNormal(provider,{manual:true});
    return this.launchBackground(provider);
  }
  async installBridge(page,provider=null){
    if(provider&&this.overlayActionHandler&&!page.__sentinelOverlayControlExposed){
      page.__sentinelOverlayControlExposed=true;
      try{await page.exposeFunction('__sentinelOverlayAction',async payload=>this.overlayActionHandler(provider,payload||{}))}catch{}
    }
    if(provider&&!page.__sentinelAssetBridgeExposed){
      page.__sentinelAssetBridgeExposed=true;
      try{await page.exposeFunction('__sentinelAssetChanged',async payload=>this.applyActiveSelection(provider,payload||{}))}catch{}
    }
    if(page.__sentinelBridgeInstalled){
      const ready=await page.evaluate(()=>!!window.__sentinelBridgeReady&&!!document.getElementById('__sentinel-input-bridge-marker')).catch(()=>false);
      if(ready)return;
    }
    page.__sentinelBridgeInstalled=true;
    const install=()=>{
      try{
        if(!document.getElementById('__sentinel-input-bridge-marker')){
          const marker=document.createElement('span');marker.id='__sentinel-input-bridge-marker';marker.style.display='none';(document.documentElement||document.body)?.appendChild(marker);
        }
        if(!window.__sentinelBridgeReady){
          window.__sentinelBridgeReady=true;window.__sentinelSockets=[];
          const nativeSend=WebSocket.prototype.send;
          WebSocket.prototype.send=function(data){try{if(!window.__sentinelSockets.includes(this))window.__sentinelSockets.push(this)}catch{}return nativeSend.call(this,data)};
          window.__sentinelSend=(payload,domain)=>{const text=typeof payload==='string'?payload:JSON.stringify(payload);const sockets=(window.__sentinelSockets||[]).filter(ws=>ws&&ws.readyState===1);const preferred=sockets.find(ws=>String(ws.url||'').includes(domain))||sockets.find(ws=>/iqoption|exnova|websocket|socket/i.test(String(ws.url||'')))||sockets[0];if(!preferred)return{ok:false,count:sockets.length,error:'no_open_websocket'};preferred.send(text);return{ok:true,count:sockets.length,url:String(preferred.url||'')}};
        }
        if(!document.getElementById('__sentinel-asset-listener-marker')){
          const marker=document.createElement('span');marker.id='__sentinel-asset-listener-marker';marker.style.display='none';(document.documentElement||document.body)?.appendChild(marker);
          const pairsFrom=(text)=>{
            const raw=String(text||'').toUpperCase();
            const ms=[...raw.matchAll(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})(?:\s*\(?OTC\)?)?/g)];
            return [...new Set(ms.map(m=>`${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`))];
          };
          const selectedPair=()=>{
            const selectors='[aria-selected="true"],[aria-checked="true"],[aria-current="true"],[data-state="active"],[data-state="selected"],[role="tab"].active,[role="tab"].selected,[class*=" active"],[class^="active"],[class*=" selected"],[class^="selected"]';
            const els=[...document.querySelectorAll(selectors)];
            for(const el of els){const p=pairsFrom(el.textContent||'');if(p.length===1)return p[0]}
            return ''
          };
          let last='';
          const publish=(symbol,source)=>{
            if(!symbol||symbol===last)return;
            last=symbol;
            window.__sentinelClickedSymbol=symbol;window.__sentinelClickedSymbolAt=Date.now();
            try{window.__sentinelAssetChanged?.({symbol,source,at:Date.now()})}catch{}
          };
          document.addEventListener('click',ev=>{
            try{
              if(ev.target?.closest?.('#sentinel-trading-overlay,#sentinel-trading-overlay-host'))return;
              const nodes=[];let node=ev.target;
              for(let i=0;i<10&&node;i++,node=node.parentElement)nodes.push(node);
              if(Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))for(const x of document.elementsFromPoint(ev.clientX,ev.clientY))if(!nodes.includes(x))nodes.push(x);
              for(const x of nodes){const p=pairsFrom(x?.textContent||'');if(p.length===1){publish(p[0],'click');break}}
              queueMicrotask(()=>{const p=selectedPair();if(p)publish(p,'selected-tab')});
            }catch{}
          },true);
          const mo=new MutationObserver(()=>{try{const p=selectedPair();if(p)publish(p,'selected-tab')}catch{}});
          mo.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['aria-selected','aria-checked','aria-current','data-state','class']});
          const initial=selectedPair();if(initial)publish(initial,'selected-tab');
        }
        if(!document.getElementById('__sentinel-amount-listener-marker')){
          const amountMarker=document.createElement('span');amountMarker.id='__sentinel-amount-listener-marker';amountMarker.style.display='none';(document.documentElement||document.body)?.appendChild(amountMarker);
          window.__sentinelAmountBuffer='';
          window.__sentinelAmountFocusUntil=0;
          let applyTimer=null;
          const visible=(el)=>{try{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>4&&r.height>4}catch{return false}};
          const desc=(el)=>[el?.textContent,el?.getAttribute?.('aria-label'),el?.getAttribute?.('title'),el?.getAttribute?.('data-test'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('name'),el?.getAttribute?.('id'),el?.className].filter(Boolean).join(' ').toLowerCase();
          const amountish=(el)=>/amount|investment|investimento|valor|stake|deal[-_ ]?amount|money/i.test(desc(el));
          const amountValueish=(el)=>amountish(el)||/investment[-_ ]?value|amount[-_ ]?value|valor[-_ ]?valor/i.test(desc(el));
          const amountContext=(target)=>{
            let n=target;
            for(let i=0;i<7&&n;i++,n=n.parentElement)if(amountValueish(n))return n;
            return null
          };
          const controls=()=>{
            const all=[...document.querySelectorAll('button,[role=button],[data-test],[data-testid]')].filter(visible);
            const pool=all.filter(el=>amountish(el)||amountish(el.parentElement));
            const plus=pool.find(el=>/increase|increment|plus|aumentar|[+]/i.test(desc(el)))||null;
            const minus=pool.find(el=>/decrease|decrement|minus|diminuir|[−-]/i.test(desc(el)))||null;
            const candidates=[...document.querySelectorAll('input,[role=spinbutton],[contenteditable=true],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[class*="investment" i]')].filter(visible);
            const valueEl=candidates.find(amountValueish)||candidates[0]||null;
            return{plus,minus,valueEl}
          };
          const readValue=()=>{
            const {valueEl}=controls();if(!valueEl)return null;
            const raw=String(valueEl.value??valueEl.getAttribute?.('aria-valuenow')??valueEl.textContent??'').replace(/\s/g,'');
            const m=raw.match(/\d+(?:[.,]\d+)?/);if(!m)return null;
            const v=Number(m[0].replace(',','.'));return Number.isFinite(v)?v:null
          };
          const showHint=(text)=>{
            let h=document.getElementById('sentinel-amount-keyboard-hint');
            if(!h){h=document.createElement('div');h.id='sentinel-amount-keyboard-hint';Object.assign(h.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483647',padding:'8px 11px',borderRadius:'9px',background:'rgba(9,20,27,.94)',border:'1px solid rgba(102,224,184,.35)',color:'#eaf4f7',font:'600 12px Segoe UI,Arial',pointerEvents:'none'});document.documentElement.appendChild(h)}
            h.textContent=text;clearTimeout(h.__t);h.__t=setTimeout(()=>h.remove(),1200)
          };
          const apply=()=>{
            const target=Number(String(window.__sentinelAmountBuffer||'').replace(',','.'));if(!Number.isFinite(target)||target<=0)return;
            const {plus,minus}=controls();if(!plus||!minus){showHint('Campo de valor não detectado');return}
            let guard=0;
            const step=()=>{
              const current=readValue();
              if(current==null){showHint('Valor atual não detectado');return}
              if(Math.abs(current-target)<.0001){showHint('Valor: '+target);return}
              if(guard++>80){showHint('Limite de ajuste atingido');return}
              (current<target?plus:minus).click();
              setTimeout(step,24)
            };
            step()
          };
          window.addEventListener('pointerdown',ev=>{
            try{
              if(ev.target?.closest?.('#sentinel-trading-overlay,#sentinel-trading-overlay-host'))return;
              const ctx=amountContext(ev.target);
              if(ctx){window.__sentinelAmountFocusUntil=Date.now()+12000;window.__sentinelAmountBuffer='';showHint('Digite o valor no teclado')}
              else window.__sentinelAmountFocusUntil=0
            }catch{}
          },true);
          window.addEventListener('keydown',ev=>{
            try{
              if(ev.target?.closest?.('#sentinel-trading-overlay,#sentinel-trading-overlay-host'))return;
              const nativeEditable=ev.target?.matches?.('input:not([readonly]):not([disabled]),textarea:not([readonly]):not([disabled]),[contenteditable="true"]');
              if(nativeEditable)return;
              const focused=Date.now()<Number(window.__sentinelAmountFocusUntil||0);
              if(!focused&&!amountContext(ev.target))return;
              if(/^\d$/.test(ev.key)){ev.preventDefault();window.__sentinelAmountBuffer=(window.__sentinelAmountBuffer||'')+ev.key;showHint('Valor: '+window.__sentinelAmountBuffer);clearTimeout(applyTimer);applyTimer=setTimeout(apply,320);return}
              if((ev.key==='.'||ev.key===',')&&!String(window.__sentinelAmountBuffer||'').includes('.')){ev.preventDefault();window.__sentinelAmountBuffer=(window.__sentinelAmountBuffer||'')+'.';showHint('Valor: '+window.__sentinelAmountBuffer);return}
              if(ev.key==='Backspace'){ev.preventDefault();window.__sentinelAmountBuffer=String(window.__sentinelAmountBuffer||'').slice(0,-1);showHint('Valor: '+(window.__sentinelAmountBuffer||'—'));return}
              if(ev.key==='Enter'){ev.preventDefault();clearTimeout(applyTimer);apply();return}
              if(ev.key==='Escape'){window.__sentinelAmountBuffer='';window.__sentinelAmountFocusUntil=0;return}
            }catch{}
          },true);
        }
      }catch{}
    };
    await page.addInitScript(install).catch(()=>{});
    await page.evaluate(install).catch(()=>{});
  }
  ingest(provider,payload,direction='in'){
    const st=this.state(provider);const before={quote:st.quote,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,activeId:st.activeId,symbol:st.symbol,lastClose:st.candles.at(-1)?.close};st.lastFrameAt=Date.now();let data=payload;
    try{if(Buffer.isBuffer(data))data=data.toString('utf8');if(typeof data==='string'){let t=data.trim();if(!(t.startsWith('{')||t.startsWith('['))){const a=t.indexOf('{'),b=t.indexOf('[');const xs=[a,b].filter(x=>x>=0);if(!xs.length)return;t=t.slice(Math.min(...xs))}data=JSON.parse(t)}}catch{return}
    try{protocolScan(data,st,direction)}catch{}
    const out={balanceCandidates:[],modeCandidates:[],assets:new Set(st.assets),activeMap:new Map(st.activeMap),quote:st.quote,symbol:st.symbol,candles:[...st.candles],lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt};
    try{recursiveScan(data,out)}catch{}
    const chosen=chooseCandidate(out.balanceCandidates,st.mode);if(chosen&&st.balance==null){st.balance=chosen.value;st.balanceSource=`network:${chosen.mode||'unknown'}`;if(chosen.mode)st.mode=chosen.mode}
    if(out.modeCandidates?.length&&!st.mode){const strong=out.modeCandidates.filter(x=>Number(x.score||0)>=10);const modes=uniq(strong.map(x=>x.mode).filter(Boolean));if(modes.length===1)st.mode=modes[0]}applyKnownBalance(st)
    st.assets=out.assets;st.activeMap=out.activeMap;
    const rawActive=n(data?.msg?.body?.active_id??data?.msg?.params?.routingFilters?.active_id??data?.msg?.active_id??data?.body?.active_id??data?.active_id);
    const marketMatches=rawActive==null||st.activeId==null||Number(rawActive)===Number(st.activeId);
    if(marketMatches&&out.quote!=null){
      const q=Number(out.quote),ts=Number(out.lastQuoteAt||Date.now());
      st.quote=q;st.lastQuoteAt=ts;
      if(Number.isFinite(q)&&q>0){
        const prev=st.quoteHistory?.at?.(-1);
        if(!prev||prev.price!==q||ts-Number(prev.ts||0)>=250){
          st.quoteHistory=[...(st.quoteHistory||[]),{ts,price:q}].filter(x=>ts-Number(x.ts||0)<=15*60*1000).slice(-1800)
        }
      }
    }
    if(out.symbol&&(!st.uiSymbol||pairKey(out.symbol)===pairKey(st.uiSymbol)))st.symbol=out.symbol;
    if(marketMatches){st.candles=mergeCandles(st.candles,out.candles);st.lastCandleAt=out.lastCandleAt||st.lastCandleAt}
    if(st.symbol){const id=st.activeMap.get(pairKey(st.symbol));if(id!=null)st.activeId=id}
    const changed=before.quote!==st.quote||before.lastQuoteAt!==st.lastQuoteAt||before.lastCandleAt!==st.lastCandleAt||before.activeId!==st.activeId||before.symbol!==st.symbol||before.lastClose!==st.candles.at(-1)?.close;
    if(changed&&this.marketUpdateHandler){try{Promise.resolve(this.marketUpdateHandler(provider,{quote:st.quote,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,activeId:st.activeId,symbol:st.symbol,uiSymbol:st.uiSymbol})).catch(()=>{})}catch{}}
  }
  attachNetwork(provider,page){if(page.__sentinelAttached)return;page.__sentinelAttached=true;
    page.on('websocket',ws=>{ws.on('framereceived',e=>this.ingest(provider,e.payload,'page-in'));ws.on('framesent',e=>this.ingest(provider,e.payload,'page-out'))});
    page.on('response',async resp=>{try{const ct=resp.headers()['content-type']||'';if(!/json|text/.test(ct))return;const url=resp.url();if(!/(iqoption|exnova)/i.test(url))return;const txt=await resp.text();if(txt.length>2_000_000)return;this.ingest(provider,txt,'http-in')}catch{}});
  }
  async directFeed(provider){
    const s=await this.session(provider);if(!s.context)return null;const cfg=this.config(provider);let cookies=[];try{cookies=await s.context.cookies()}catch{}
    const cookie=cookies.find(c=>String(c.name).toLowerCase()==='ssid'&&String(c.domain||'').includes(cfg.domain.replace(/^www\./,'')))||cookies.find(c=>String(c.name).toLowerCase()==='ssid');
    if(!cookie?.value){const st=this.state(provider);st.lastDirectError='ssid_cookie_not_found';return null}
    let feed=this.feeds.get(provider);if(!feed){feed=new QuadcodeFeed({domain:cfg.wsDomain||cfg.domain,onFrame:(raw,dir)=>this.ingest(provider,raw,dir)});this.feeds.set(provider,feed)}
    try{const status=await feed.connect(cookie.value);const st=this.state(provider);st.directStatus=status;st.lastDirectError=null;if(status.ready)st.protocol='direct-websocket';return feed}catch(e){const st=this.state(provider);st.lastDirectError=String(e?.message||e);st.directStatus=feed.status();return null}
  }
  async wsSend(provider,payload){const feed=await this.directFeed(provider).catch(()=>null);if(feed?.ready&&feed.send(payload))return{ok:true,transport:'direct-websocket'};const s=await this.session(provider);if(!s.page)return{ok:false,error:'page_missing'};const cfg=this.config(provider);try{const r=await s.page.evaluate(({payload,domain})=>window.__sentinelSend?window.__sentinelSend(payload,domain):{ok:false,error:'bridge_missing'},{payload,domain:cfg.domain});return{...r,transport:r?.ok?'page-websocket':undefined}}catch(e){return{ok:false,error:String(e?.message||e)}}}
  async requestBaseData(provider){const st=this.state(provider),rid=reqId(provider);const requests=[
    {name:'sendMessage',msg:{name:'get-balances',version:'1.0'},request_id:`${rid}-bal`},
    {name:'sendMessage',msg:{name:'get-initialization-data',version:'3.0',body:{}},request_id:`${rid}-init`},
    {name:'subscribeMessage',msg:{name:'internal-billing.balance-changed',version:'1.0',params:{routingFilters:{}}},request_id:`${rid}-bal-sub`},
    {name:'subscribeMessage',msg:{name:'internal-billing.auth-balance-changed',version:'1.0',params:{routingFilters:{}}},request_id:`${rid}-authbal-sub`}
  ];let ok=false;for(const q of requests){const r=await this.wsSend(provider,q);ok=ok||!!r?.ok}st.lastRequestAt=Date.now();if(ok)st.protocol='active-websocket';return ok}
  async _requestCandles(provider,{symbol=null,activeId=null,force=false}={}){
    const st=this.state(provider),targetSymbol=symbol||st.uiSymbol||st.symbol;if(!targetSymbol)return false;
    const targetId=activeId??st.activeMap.get(pairKey(targetSymbol))??st.activeId;if(targetId==null)return false;
    const size=Number(st.candleSize||60),changed=st.subscribedSymbol!==targetSymbol||String(st.subscribedActiveId)!==String(targetId);
    if(changed&&st.subscribedActiveId!=null){
      await this.wsSend(provider,{name:'unsubscribeMessage',msg:{name:'candle-generated',version:'2.0',params:{routingFilters:{active_id:Number(st.subscribedActiveId),size}}},request_id:reqId('unsub')}).catch(()=>{});
    }
    if(changed){st.candles=[];st.quote=null}
    st.symbol=targetSymbol;st.activeId=Number(targetId);
    if(changed||force||st.candles.length<50){
      const feed=await this.directFeed(provider).catch(()=>null);
      const now=feed?.serverTimeSeconds?.()||Math.floor(Date.now()/1000);
      const rid=reqId('candles');
      const modern={name:'sendMessage',msg:{name:'get-candles',version:'2.0',body:{active_id:Number(targetId),size,to:now,count:200}},request_id:rid};
      st.lastCandleRequest={transport:'modern',symbol:targetSymbol,activeId:Number(targetId),size,to:now,at:Date.now()};
      if(feed?.ready){
        try{
          const response=await feed.request(modern,6000);
          st.lastCandleResponse={name:String(response?.name||''),requestId:String(response?.request_id||''),hasMsg:!!response?.msg,at:Date.now()};
        }catch(e){
          st.lastCandleResponse={name:'timeout',error:String(e?.message||e),at:Date.now()};
        }
      }else await this.wsSend(provider,modern).catch(()=>{});
      await sleep(120);
      if(st.candles.length<50){
        const legacyRid=reqId('legacy-candles');
        const legacy={name:'candles',msg:{active_id:Number(targetId),duration:size,chunk_size:25,from:now-(size*220),till:now},request_id:legacyRid};
        st.lastCandleRequest={transport:'legacy-fallback',symbol:targetSymbol,activeId:Number(targetId),size,to:now,at:Date.now()};
        if(feed?.ready){
          try{
            const response=await feed.request(legacy,6000);
            st.lastCandleResponse={name:String(response?.name||''),requestId:String(response?.request_id||''),hasMsg:!!response?.msg,legacy:true,at:Date.now()};
          }catch(e){
            st.lastCandleResponse={name:'legacy-timeout',error:String(e?.message||e),legacy:true,at:Date.now()};
            await this.wsSend(provider,legacy).catch(()=>{});
          }
        }else await this.wsSend(provider,legacy).catch(()=>{});
      }
      await this.wsSend(provider,{name:'subscribeMessage',msg:{name:'candle-generated',version:'2.0',params:{routingFilters:{active_id:Number(targetId),size}}},request_id:`${rid}-sub`}).catch(()=>{});
      st.subscribedSymbol=targetSymbol;st.subscribedActiveId=Number(targetId);st.lastRequestAt=Date.now();if(st.protocol==='passive')st.protocol='active-websocket';
    }
    return st.candles.length>=50;
  }
  async recoverMarket(provider){
    const st=this.state(provider),now=Date.now();
    if(st.mode!=='demo')return false;
    if(st.lastRecoveryAt&&now-st.lastRecoveryAt<15000)return false;
    st.lastRecoveryAt=now;st.suggestedSymbol=null;
    const screenSymbol=st.uiSymbol||st.symbol;
    if(screenSymbol){
      const screenId=st.activeMap.get(pairKey(screenSymbol));
      if(screenId!=null){
        st.symbol=screenSymbol;st.activeId=Number(screenId);st.autoSelected=false;
        await this._requestCandles(provider,{symbol:screenSymbol,activeId:screenId,force:true}).catch(()=>{});
        await sleep(220);
        if(candleFreshForState(st)&&st.candles.length>=50){
          st.marketStatus='open';st.marketReason=`Ativo da tela ${screenSymbol} com feed atual`;return true;
        }
      }
    }
    const available=[...st.assets].filter(x=>/\bOTC\b/i.test(String(x)));
    const candidates=uniq([...OTC_PREFERRED,...available]).filter(x=>pairKey(x)!==pairKey(screenSymbol||'')&&st.activeMap.get(pairKey(x))!=null).slice(0,12);
    for(const candidate of candidates){
      const id=st.activeMap.get(pairKey(candidate));if(id==null)continue;
      const saved={symbol:st.symbol,activeId:st.activeId,candles:[...st.candles],quote:st.quote,subscribedSymbol:st.subscribedSymbol,subscribedActiveId:st.subscribedActiveId};
      st.candles=[];st.quote=null;st.subscribedSymbol=null;st.subscribedActiveId=null;
      await this._requestCandles(provider,{symbol:candidate,activeId:id,force:true}).catch(()=>{});
      await sleep(220);
      const viable=candleFreshForState(st)&&st.candles.length>=50;
      st.symbol=saved.symbol;st.activeId=saved.activeId;st.candles=saved.candles;st.quote=saved.quote;st.subscribedSymbol=saved.subscribedSymbol;st.subscribedActiveId=saved.subscribedActiveId;
      if(viable){
        st.suggestedSymbol=candidate;
        st.marketStatus='needs-switch';
        st.marketReason=`Ativo da tela ${screenSymbol||'—'} sem feed suficiente. Sugestão disponível: ${candidate}. Troque o ativo na corretora para o Sentinel analisar e operar o mesmo ativo.`;
        st.autoSelected=false;
        return false;
      }
    }
    st.marketStatus='closed';
    st.marketReason=`Ativo da tela ${screenSymbol||'—'} sem candles atuais e nenhum ativo alternativo disponível agora.`;
    st.autoSelected=false;
    return false;
  }
  async requestMarketData(provider,{force=false}={}){
    const st=this.state(provider);
    const screenSymbol=st.uiSymbol||st.symbol;
    if(!screenSymbol)return false;
    if(!st.symbol||pairKey(st.symbol)!==pairKey(screenSymbol)){
      st.symbol=screenSymbol;st.activeId=st.activeMap.get(pairKey(screenSymbol))??st.activeId;st.candles=[];st.quote=null;st.quoteHistory=[];st.subscribedSymbol=null;st.subscribedActiveId=null;st.autoSelected=false;st.suggestedSymbol=null;
    }
    await this._requestCandles(provider,{symbol:screenSymbol,activeId:st.activeMap.get(pairKey(screenSymbol))??st.activeId,force});
    if(candleFreshForState(st)&&st.candles.length>=50){
      st.marketStatus='open';st.marketReason=`Ativo da tela ${screenSymbol} com candles atuais`;st.suggestedSymbol=null;return true;
    }
    const age=latestCandleAgeMs(st);
    st.marketStatus='stale';st.marketReason=age==null?`Aguardando candles do ativo da tela ${screenSymbol}`:`Última candle de ${screenSymbol} há ${Math.round(age/60000)} min`;
    if(st.mode==='demo')await this.recoverMarket(provider);
    return candleFreshForState(st)&&st.candles.length>=50;
  }
  async scanExecutionUi(provider){
    const s=await this.session(provider),st=this.state(provider);if(!s.page)return false;
    try{
      const ui=await s.page.evaluate(()=>{
        const visible=(el)=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>8&&r.height>8};
        const desc=(el)=>[el.textContent,el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.getAttribute?.('data-test'),el.getAttribute?.('data-testid'),el.getAttribute?.('name'),el.getAttribute?.('id'),el.className].filter(Boolean).join(' ').toLowerCase();
        const all=[...document.querySelectorAll('button,[role=button],[data-test],[data-testid]')].filter(visible);
        const score=(el,kind)=>{
          const d=desc(el);let n=0;
          const up=/(deal[-_ ]?button[-_ ]?up|button[-_ ]?up|call|higher|comprar|compra|buy|acima|up)/i;
          const down=/(deal[-_ ]?button[-_ ]?down|button[-_ ]?down|put|lower|vender|venda|sell|abaixo|down)/i;
          const rx=kind==='buy'?up:down;if(rx.test(d))n+=10;
          if(el.tagName==='BUTTON'||el.getAttribute?.('role')==='button')n+=3;
          const r=el.getBoundingClientRect();if(r.width>55&&r.height>28)n+=2;
          return n;
        };
        const ranked=(kind)=>all.map(el=>({el,s:score(el,kind)})).filter(x=>x.s>=10).sort((a,b)=>b.s-a.s)[0]?.el||null;
        const buy=ranked('buy'),sell=ranked('sell');
        const amountEls=[...document.querySelectorAll('input,[role=spinbutton],[contenteditable=true],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[class*="investment" i]')].filter(visible);
        const amount=amountEls.find(el=>/amount|investment|investimento|valor|stake|deal[-_ ]?amount|money/i.test(desc(el)))||amountEls.find(el=>el.tagName==='INPUT'||el.getAttribute?.('role')==='spinbutton')||null;
        const stepButtons=all.filter(el=>/increase|decrease|increment|decrement|plus|minus|aumentar|diminuir|amount|investment|investimento|valor/i.test(desc(el)));
        const plus=stepButtons.find(el=>/increase|increment|plus|aumentar|[+]/.test(desc(el)))||null;
        const minus=stepButtons.find(el=>/decrease|decrement|minus|diminuir|[−-]/.test(desc(el)))||null;
        return{
          buy:!!buy,sell:!!sell,amount:!!amount||!!(plus&&minus),amountStepper:!!(plus&&minus),
          buyText:buy?desc(buy).slice(0,180):'',
          sellText:sell?desc(sell).slice(0,180):'',
          amountText:amount?desc(amount).slice(0,180):((plus&&minus)?'stepper +/-':''),
          buttonCount:all.length,amountCandidateCount:amountEls.length
        };
      });
      const assetMatch=!!(st.uiSymbol&&st.symbol&&pairKey(st.uiSymbol)===pairKey(st.symbol));
      st.executionUi={...ui,assetMatch,uiSymbol:st.uiSymbol,marketSymbol:st.symbol};
      st.executionReady=!!(ui.buy&&ui.sell&&ui.amount&&st.mode==='demo'&&assetMatch);
      return st.executionReady
    }catch(e){
      st.executionUi={buy:false,sell:false,amount:false,assetMatch:false,error:String(e?.message||e)};
      st.executionReady=false;return false
    }
  }
  async placeDemoOrder(provider,order={}){
    const st=this.state(provider);await this.domSnapshot(provider).catch(()=>{});await this.scanExecutionUi(provider);
    if(st.mode!=='demo')throw new Error('demo_order_blocked_account_not_demo');
    if(!st.executionReady)throw new Error('demo_order_controls_not_detected');
    if(!st.uiSymbol||!order.asset||pairKey(st.uiSymbol)!==pairKey(order.asset)||pairKey(st.symbol)!==pairKey(order.asset))throw new Error('demo_order_asset_mismatch');
    const amount=Number(order.amount),side=String(order.side||'').toUpperCase();
    if(!Number.isFinite(amount)||amount<=0)throw new Error('demo_order_invalid_amount');
    if(!['BUY','SELL'].includes(side))throw new Error('demo_order_invalid_side');
    const s=await this.session(provider);
    const result=await s.page.evaluate(({amount,side})=>{
      const visible=(el)=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>8&&r.height>8};
      const desc=(el)=>[el.textContent,el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.getAttribute?.('data-test'),el.getAttribute?.('data-testid'),el.getAttribute?.('name'),el.getAttribute?.('id'),el.className].filter(Boolean).join(' ').toLowerCase();
      const all=[...document.querySelectorAll('button,[role=button],[data-test],[data-testid]')].filter(visible);
      const rx=side==='BUY'?/(deal[-_ ]?button[-_ ]?up|button[-_ ]?up|call|higher|comprar|compra|buy|acima|up)/i:/(deal[-_ ]?button[-_ ]?down|button[-_ ]?down|put|lower|vender|venda|sell|abaixo|down)/i;
      const target=all.map(el=>({el,d:desc(el)})).filter(x=>rx.test(x.d)).sort((a,b)=>((b.el.tagName==='BUTTON'?3:0)+(b.el.getAttribute?.('role')==='button'?2:0))-((a.el.tagName==='BUTTON'?3:0)+(a.el.getAttribute?.('role')==='button'?2:0)))[0]?.el||null;
      const amountEls=[...document.querySelectorAll('input,[role=spinbutton],[contenteditable=true],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[class*="investment" i]')].filter(visible);
      let input=amountEls.find(el=>/amount|investment|investimento|valor|stake|deal[-_ ]?amount|money/i.test(desc(el)))||amountEls.find(el=>el.tagName==='INPUT'||el.getAttribute?.('role')==='spinbutton')||null;
      if(input&&input.tagName!=='INPUT'&&input.querySelector)input=input.querySelector('input,[role=spinbutton],[contenteditable=true]')||input;
      const stepButtons=all.filter(el=>/increase|decrease|increment|decrement|plus|minus|aumentar|diminuir|amount|investment|investimento|valor/i.test(desc(el)));
      const plus=stepButtons.find(el=>/increase|increment|plus|aumentar|[+]/.test(desc(el)))||null;
      const minus=stepButtons.find(el=>/decrease|decrement|minus|diminuir|[−-]/.test(desc(el)))||null;
      if(!target||(!input&&!(plus&&minus)))return{ok:false,error:'trade_controls_missing',target:!!target,amount:!!input,stepper:!!(plus&&minus)};
      let amountControl='';
      if(input){
        try{
          input.focus?.();
          if(input.tagName==='INPUT'){
            const proto=Object.getPrototypeOf(input),setter=Object.getOwnPropertyDescriptor(proto,'value')?.set||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
            if(setter)setter.call(input,String(amount));else input.value=String(amount);
          }else if(input.getAttribute?.('contenteditable')==='true')input.textContent=String(amount);
          else if('value' in input)input.value=String(amount);
          input.dispatchEvent(new Event('input',{bubbles:true}));
          input.dispatchEvent(new Event('change',{bubbles:true}));
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}));
          input.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',bubbles:true}));
          amountControl=desc(input).slice(0,180);
        }catch(e){return{ok:false,error:'amount_set_failed',detail:String(e?.message||e)}}
      }else{
        const parseAmount=()=>{
          const candidates=[...document.querySelectorAll('[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[class*="investment" i],[role=spinbutton]')].filter(visible);
          for(const el of candidates){const m=String(el.textContent||el.getAttribute?.('aria-valuenow')||'').replace(/\s/g,'').match(/\d+(?:[.,]\d+)?/);if(m){const v=Number(m[0].replace(',','.'));if(Number.isFinite(v)&&v>=0)return v}}
          return null;
        };
        let current=parseAmount();
        if(current==null)return{ok:false,error:'amount_stepper_value_not_found'};
        let guard=0;
        while(Math.abs(current-amount)>0.001&&guard++<60){
          const before=current;
          (current<amount?plus:minus).click();
          const next=parseAmount();
          if(next==null||Math.abs(next-before)<0.0001)break;
          current=next;
        }
        if(Math.abs(current-amount)>0.001)return{ok:false,error:'amount_stepper_target_not_reached',current,target:amount};
        amountControl='stepper +/-';
      }
      target.click();
      return{ok:true,button:desc(target).slice(0,180),amountControl}
    },{amount,side});
    if(!result?.ok)throw new Error(result?.error||'demo_order_click_failed');
    st.lastRequestAt=Date.now();
    return{id:`demo-${provider}-${Date.now()}`,provider,asset:st.symbol,side,amount,status:'submitted',openedAt:new Date().toISOString(),referencePrice:st.quote,external:true,button:result.button,amountControl:result.amountControl}
  }
  applyActiveSelection(provider,{symbol=null,activeId=null,source='ui'}={}){
    const st=this.state(provider);
    const aid=Number(activeId);
    let next=symbol?pairStrings(symbol)[0]||null:null;
    if(!next&&Number.isFinite(aid)){
      const key=[...st.activeMap.entries()].find(([,id])=>Number(id)===aid)?.[0]||null;
      if(key)next=[...st.assets].find(x=>pairKey(x)===key)||(key.endsWith('OTC')?`${key.slice(0,3)}/${key.slice(3,6)} OTC`:`${key.slice(0,3)}/${key.slice(3,6)}`);
    }
    if(!next)return false;
    const changed=pairKey(next)!==pairKey(st.uiSymbol||'')||pairKey(next)!==pairKey(st.symbol||'');
    st.uiSymbol=next;st.symbol=next;st.lastUiSignalAt=Date.now();st.uiSymbolSource=source;st.autoSelected=false;
    const mapped=st.activeMap.get(pairKey(next));
    if(mapped!=null)st.activeId=mapped;else if(Number.isFinite(aid))st.activeId=aid;
    if(changed){
      st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;
      st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;st.lastRequestAt=null;
      st.marketStatus='switching';st.marketReason=`Ativo alterado na corretora: ${next}`;
      try{Promise.resolve(this.marketUpdateHandler?.(provider,{symbol:next,uiSymbol:next,activeId:st.activeId,source})).catch(()=>{})}catch{}
      setTimeout(()=>this.requestMarketData(provider,{force:true}).catch(()=>{}),0);
    }
    return true
  }
  async maintain(provider){
    const st=this.state(provider),now=Date.now();
    await this.domSnapshot(provider,{fast:true}).catch(()=>{});
    if(st.lastMaintainAt&&now-st.lastMaintainAt<900)return this.liveStatus(provider);st.lastMaintainAt=now;
    const direct=this.feeds.get(provider);const directStatus=direct?.status?.();
    if(directStatus&&directStatus.messageAgeMs!=null&&directStatus.messageAgeMs>30000){
      await direct.close().catch(()=>{});this.feeds.delete(provider);st.directStatus=null;st.lastDirectError='websocket_stale_reconnecting';st.protocol='reconnecting';
    }
    await this.domSnapshot(provider).catch(()=>{});
    if(!st.lastRequestAt||now-st.lastRequestAt>7000||st.balance==null)await this.requestBaseData(provider).catch(()=>{});
    await sleep(120);
    const actualAge=latestCandleAgeMs(st);const stale=actualAge==null||actualAge>Math.max(90000,Number(st.candleSize||60)*2000);
    await this.requestMarketData(provider,{force:st.candles.length<50||stale}).catch(()=>{});
    if(candleFreshForState(st)){st.marketStatus='open';st.marketReason=`${st.symbol||'Ativo'} com candles atuais`}
    else if(st.marketStatus!=='recovering'&&st.marketStatus!=='closed'){st.marketStatus='stale';st.marketReason='Feed conectado, mas sem candle recente'}
    await this.scanExecutionUi(provider).catch(()=>{});
    return this.liveStatus(provider)
  }
  async domSnapshot(provider,{allowAttach=false,fast=false}={}){const s=await this.session(provider);if(!s.page){if(allowAttach)await this.attachAutomation(provider,{manual:true});else throw new Error('broker_browser_not_attached')}const page=s.page;await this.installBridge(page,provider).catch(()=>{});const st=this.state(provider);let text='',title='',url='';try{url=page.url();title=await page.title();if(!fast)text=(await page.locator('body').innerText({timeout:1800})).slice(0,70000)}catch{}
    let accountText='',instrumentText='',activeSymbol='',clickedSymbol='',clickedAt=0;try{const dom=await page.evaluate(()=>{const visible=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};const pair=(t)=>{const m=String(t||'').toUpperCase().match(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})(?:\s*\(?OTC\)?)?/);return m?`${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`:''};const els=[...document.querySelectorAll('[aria-selected],[aria-checked],[aria-current],[data-state],[class*="active"],[class*="selected"],[data-test*="account"],[data-test*="balance"],[data-test*="asset"],[data-test*="instrument"],[role="tab"]')].filter(visible);const acct=els.map(el=>String(el.textContent||'').trim()).filter(t=>/practice|prática|demo|real account|conta real|conta de prática|saldo real|practice balance/i.test(t)).slice(0,30);const assetEls=els.filter(el=>pair(el.textContent||''));const score=(el)=>{const cls=String(el.className||'').toLowerCase(),state=String(el.getAttribute?.('data-state')||'').toLowerCase(),cur=String(el.getAttribute?.('aria-current')||'').toLowerCase();let n=0;if(el.getAttribute?.('aria-selected')==='true')n+=100;if(el.getAttribute?.('aria-checked')==='true')n+=90;if(cur&&cur!=='false')n+=80;if(/active|selected|current|checked/.test(state))n+=75;if(/(^|[ _-])(active|selected|current)([ _-]|$)/.test(cls))n+=60;return n};const ranked=assetEls.map(el=>({p:pair(el.textContent||''),s:score(el)})).filter(x=>x.p).sort((a,b)=>b.s-a.s);const active=ranked[0]&&ranked[0].s>0?ranked[0].p:'';const inst=assetEls.map(el=>String(el.textContent||'').trim()).slice(0,30);return{accountText:acct.join(' | '),instrumentText:inst.join(' | '),activeSymbol:active,clickedSymbol:String(window.__sentinelClickedSymbol||''),clickedAt:Number(window.__sentinelClickedSymbolAt||0)}});accountText=dom.accountText||'';instrumentText=dom.instrumentText||'';activeSymbol=dom.activeSymbol||'';clickedSymbol=dom.clickedSymbol||'';clickedAt=Number(dom.clickedAt||0)}catch{}
    st.lastDomAt=Date.now();if(!fast){for(const a of pairStrings(text))st.assets.add(a);const mode=detectMode(accountText)||st.mode;if(mode)st.mode=mode;applyKnownBalance(st);const b=bestBalanceFromText(text,st.mode);if(b&&b.value!=null&&b.score>=10&&(!st.mode||!b.mode||b.mode===st.mode)){st.balance=b.value;st.balanceSource=`dom:${b.mode||st.mode||'unknown'}`}};
    const clickedFresh=clickedAt>0&&Date.now()-clickedAt<8000;const clickedPairs=clickedFresh&&clickedSymbol?pairStrings(clickedSymbol):[];const domActive=activeSymbol?pairStrings(activeSymbol):[];const instrumentPairs=pairStrings(instrumentText);
    let nextUi=null,uiSource=null;
    if(domActive.length===1){nextUi=domActive[0];uiSource='dom-active'}
    else if(clickedPairs.length===1){nextUi=clickedPairs[0];uiSource='click'}
    else if(instrumentPairs.length===1){nextUi=instrumentPairs[0];uiSource='dom-single'}
    else if(st.uiSymbol&&instrumentPairs.some(x=>pairKey(x)===pairKey(st.uiSymbol))){nextUi=st.uiSymbol;uiSource=st.uiSymbolSource||'preserved'}
    if(nextUi){
      const changed=pairKey(nextUi)!==pairKey(st.uiSymbol||'');
      if(changed){
        st.uiSymbol=nextUi;st.symbol=nextUi;st.activeId=st.activeMap.get(pairKey(nextUi))??null;st.lastUiSignalAt=Date.now();st.uiSymbolSource=uiSource;
        st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;
        st.marketStatus='switching';st.marketReason=`Trocando leitura e análise para ${nextUi}`;st.lastRequestAt=null;st.autoSelected=false;
        try{Promise.resolve(this.marketUpdateHandler?.(provider,{symbol:nextUi,uiSymbol:nextUi,activeId:st.activeId,source:uiSource,assetChanged:true})).catch(()=>{})}catch{}
        setTimeout(()=>this.requestMarketData(provider,{force:true}).catch(()=>{}),0);
      }else{st.uiSymbol=nextUi;st.lastUiSignalAt=Date.now();st.uiSymbolSource=uiSource;if(!st.autoSelected||pairKey(st.uiSymbol)===pairKey(st.symbol)){st.symbol=st.uiSymbol;st.autoSelected=false}}
    }else if(!st.uiSymbol&&!fast){const p=pairStrings(text);if(p.length===1){st.uiSymbol=p[0];st.symbol=p[0];st.lastUiSignalAt=Date.now();st.uiSymbolSource='body-single'}}
    if(st.symbol){const id=st.activeMap.get(pairKey(st.symbol));if(id!=null)st.activeId=id}
    if(st.quote==null&&st.symbol){try{const q=await page.evaluate((symbol)=>{const all=[...document.querySelectorAll('body *')];const sym=all.find(el=>el.textContent?.trim()===symbol);if(!sym)return null;let node=sym;for(let d=0;d<5&&node;d++,node=node.parentElement){const txt=node.textContent||'';const nums=txt.match(/\b\d{1,5}[.,]\d{2,6}\b/g)||[];for(const x of nums){const v=Number(x.replace(',','.'));if(Number.isFinite(v)&&v>0)return v}}return null},st.symbol);if(q){st.quote=q;st.lastQuoteAt=Date.now()}}catch{}}
    return{provider,open:true,url,title,text,st};
  }
  async sessionInfo(provider){const cfg=this.config(provider),s=await this.session(provider);
    if(s.normal&&!s.normal.killed){const info={provider,open:true,sessionPresent:false,likelyAuthenticated:false,url:cfg.url,title:cfg.label,cookieCount:0,phase:'normal-login',updatedAt:nowIso()};this.last.set(provider,info);return info}
    if(!s.browser){return{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,updatedAt:nowIso()}}
    let snap;try{snap=await this.domSnapshot(provider,{allowAttach:false})}catch{snap={url:s.page?.url?.()||'',title:'',text:'',st:this.state(provider)}}
    let cookies=[];try{cookies=await s.context.cookies([`https://${cfg.domain}`])}catch{}
    let authCookieSeen=cookies.some(x=>String(x?.name||'').toLowerCase()==='ssid'&&String(x?.value||'').length>8);
    let loginish=/login|signin|entrar|register|cadastro/i.test(`${snap.url} ${snap.title}`);
    let traderish=/trade|traderoom|platform|portfolio|dashboard/i.test(snap.url);
    if(authCookieSeen&&!loginish&&!traderish&&!s.background){
      try{
        await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:18000});
        snap=await this.domSnapshot(provider,{allowAttach:false});
        loginish=/login|signin|entrar|register|cadastro/i.test(`${snap.url} ${snap.title}`);
        traderish=/trade|traderoom|platform|portfolio|dashboard/i.test(snap.url);
      }catch{}
    }
    const textHint=/(conta de prática|practice account|practice balance|conta real|real account|saldo|balance|portfolio|carteira|deposit|depósito|withdraw|retirar)/i.test(snap.text||'');
    const likelyAuthenticated=authCookieSeen&&!loginish&&(traderish||textHint);const sessionPresent=likelyAuthenticated;
    const phase=loginish?'login-required':sessionPresent?(s.background?'background-authenticated':'traderoom-authenticated'):(s.background?'background':'attached');
    const info={provider,open:true,sessionPresent,likelyAuthenticated,url:snap.url,title:snap.title,cookieCount:cookies.length,authCookieSeen,phase,background:!!s.background,updatedAt:nowIso()};this.last.set(provider,info);return info;
  }
  peek(provider){return this.last.get(provider)||{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,updatedAt:null}}
  liveStatus(provider){
    const st=this.state(provider);const assets=uniq([st.symbol,st.uiSymbol,...st.assets]);const last=st.candles.at(-1)||null;const latestCandleTs=epochMs(last?.to??last?.from);const candleAgeMs=latestCandleTs==null?null:Math.max(0,Date.now()-latestCandleTs);const candleFresh=candleFreshForState(st);
    const feedValidated=!!(st.balance!=null&&['demo','real'].includes(st.mode)&&st.symbol&&st.activeId!=null&&st.quote!=null&&st.candles.length>=50&&candleFresh);
    const marketStatus=candleFresh?'open':(st.marketStatus||'stale');const marketReason=candleFresh?`${st.symbol||'Ativo'} atualizado`:(st.marketReason||'Sem candle recente');
    return{balance:st.balance,balanceSource:st.balanceSource,assets:assets.slice(0,500),activeId:st.activeId,quote:st.quote,symbol:st.symbol,uiSymbol:st.uiSymbol,candles:st.candles.slice(-400),quoteHistory:(st.quoteHistory||[]).slice(-900),mode:st.mode,quoteTs:Math.max(Number(st.lastQuoteAt||0),Number(st.lastCandleAt||0),Number(latestCandleTs||0)),lastFrameAt:st.lastFrameAt,lastDomAt:st.lastDomAt,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,latestCandleTs,candleAgeMs,candleFresh,marketStatus,marketReason,autoSelected:!!st.autoSelected,lastRequestAt:st.lastRequestAt,protocol:st.protocol,directStatus:st.directStatus,lastDirectError:st.lastDirectError,lastCandleRequest:st.lastCandleRequest,lastCandleResponse:st.lastCandleResponse,suggestedSymbol:st.suggestedSymbol,feedValidated,executionReady:st.executionReady,executionUi:st.executionUi}
  }
  async updateOverlay(provider,data={}){
    const s=await this.session(provider);if(!s?.page||s.background)return false;
    try{
      const payload=JSON.parse(JSON.stringify(data||{}));
      await s.page.evaluate((d)=>{
        const render=(d)=>{
        window.__sentinelLastOverlayData=d;
        const hostId='sentinel-trading-overlay-host',id='sentinel-trading-overlay';
        let host=document.getElementById(hostId),el=host?.shadowRoot?.getElementById(id)||null;
        const legacy=document.getElementById(id);if(legacy&&!host)legacy.remove();
        if(host&&host.dataset.uiVersion!=='10.13'){host.remove();host=null;el=null}
        if(!el){
          host=document.createElement('div');host.id=hostId;host.dataset.uiVersion='10.13';
          Object.assign(host.style,{all:'initial',position:'static',zIndex:'2147483647'});
          const shadow=host.attachShadow({mode:'open'});
          const reset=document.createElement('style');
          reset.textContent=`:host{all:initial}*,*::before,*::after{box-sizing:border-box}button,select,input{font:inherit;text-transform:none;letter-spacing:normal}button{margin:0}#sentinel-trading-overlay::-webkit-scrollbar{width:7px;height:7px}#sentinel-trading-overlay::-webkit-scrollbar-track{background:transparent}#sentinel-trading-overlay::-webkit-scrollbar-thumb{background:rgba(154,132,88,.55);border-radius:999px}#sentinel-trading-overlay::-webkit-scrollbar-thumb:hover{background:rgba(190,160,96,.72)}`;
          shadow.appendChild(reset);
          el=document.createElement('section');el.id=id;el.dataset.uiVersion='10.13';shadow.appendChild(el);
          Object.assign(el.style,{
            position:'fixed',right:'12px',top:'12px',zIndex:'2147483647',
            width:'470px',height:'min(650px, calc(100vh - 24px))',minWidth:'390px',maxWidth:'min(660px, calc(100vw - 18px))',
            minHeight:'360px',maxHeight:'calc(100vh - 18px)',resize:'both',
            overflowY:'auto',overflowX:'hidden',boxSizing:'border-box',overscrollBehavior:'contain',scrollbarGutter:'stable',
            background:'linear-gradient(155deg,rgba(7,17,24,.992),rgba(10,27,36,.986))',color:'#f4f8fa',
            border:'1px solid rgba(111,174,192,.24)',borderRadius:'18px',
            boxShadow:'0 24px 72px rgba(0,0,0,.55), inset 0 1px rgba(255,255,255,.035)',
            backdropFilter:'blur(18px)',
            fontFamily:'"Segoe UI Variable Display","Aptos Display","Inter","Segoe UI",Arial,sans-serif',
            fontSize:'12px',lineHeight:'1.3',padding:'14px',pointerEvents:'auto',userSelect:'none',
            scrollbarWidth:'thin',scrollbarColor:'#385461 transparent'
          });
          try{
            const saved=JSON.parse(localStorage.getItem('sentinel-overlay-pos-v1')||'null');
            if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
              el.style.left=Math.max(8,Math.min(window.innerWidth-390,saved.x))+'px';
              el.style.top=Math.max(8,Math.min(window.innerHeight-100,saved.y))+'px';
              el.style.right='auto'
            }
            const savedSize=JSON.parse(localStorage.getItem('sentinel-overlay-size-v104')||'null');
            if(savedSize&&Number.isFinite(savedSize.w)&&Number.isFinite(savedSize.h)){
              el.style.width=Math.max(390,Math.min(window.innerWidth-18,savedSize.w))+'px';
              el.style.height=Math.max(360,Math.min(window.innerHeight-18,savedSize.h))+'px'
            }
          }catch{}
          document.documentElement.appendChild(host);
          try{
            const ro=new ResizeObserver(()=>{try{const rr=el.getBoundingClientRect();localStorage.setItem('sentinel-overlay-size-v104',JSON.stringify({w:Math.round(rr.width),h:Math.round(rr.height)}))}catch{}});
            ro.observe(el);el.__sentinelResizeObserver=ro
          }catch{}
          let drag=null;
          const stop=()=>{if(!drag)return;drag=null;try{const r=el.getBoundingClientRect();localStorage.setItem('sentinel-overlay-pos-v1',JSON.stringify({x:r.left,y:r.top}))}catch{}};
          el.addEventListener('pointerdown',ev=>{
            if(ev.target?.closest?.('button,select'))return;
            const h=ev.target?.closest?.('[data-sentinel-drag]');if(!h)return;
            const r=el.getBoundingClientRect();drag={dx:ev.clientX-r.left,dy:ev.clientY-r.top};
            el.style.left=r.left+'px';el.style.top=r.top+'px';el.style.right='auto';
            try{el.setPointerCapture(ev.pointerId)}catch{};ev.preventDefault()
          });
          el.addEventListener('pointermove',ev=>{
            if(!drag)return;
            const maxX=Math.max(8,window.innerWidth-el.offsetWidth-8),maxY=Math.max(8,window.innerHeight-el.offsetHeight-8);
            el.style.left=Math.max(8,Math.min(maxX,ev.clientX-drag.dx))+'px';
            el.style.top=Math.max(8,Math.min(maxY,ev.clientY-drag.dy))+'px';ev.preventDefault()
          });
          el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
        }

        const esc=v=>String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
        const n=(v,dg=0)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toFixed(dg):'—';
        const m=d.metrics||{},plan=d.plan||{},q=d.quality||{},short=m.shortModel||{};
        const analysisTransient=d.analysisTransient===true,analysisStale=d.analysisStale===true;
        const side=String(d.side||'WAIT').toUpperCase(),raw=String(q.rawSide||side||'WAIT').toUpperCase();
        const entryGateReady=q.entryReady===true;
        const rawLabel=raw==='BUY'?'CALL':raw==='SELL'?'PUT':'AGUARDAR';
        const signal=entryGateReady?(side==='BUY'?'CALL':side==='SELL'?'PUT':'AGUARDAR'):'AGUARDAR';
        const gold='#c9a65b',goldSoft='#ecd28d';
        const tone=signal==='CALL'?'#69e1b5':signal==='PUT'?'#ff8f9c':gold;
        const duration=Number(d.durationMs||60000),strategy=String(d.strategy||'smart_confluence');
        const shortWindow=duration<=60000,shortReady=!shortWindow||short.ready===true;
        const confidence=!analysisStale&&shortReady&&d.confidence!=null?Math.max(0,Math.min(100,Number(d.confidence))):null;
        const buy=!analysisStale&&shortReady&&m.buyScore!=null?Math.max(0,Math.min(100,Number(m.buyScore))):null;
        const sell=!analysisStale&&shortReady&&m.sellScore!=null?Math.max(0,Math.min(100,Number(m.sellScore))):null;
        const runtime=String(d.state||'stopped').toLowerCase(),runtimeLabel=runtime==='running'?'ATIVO':runtime==='paused'?'PAUSADO':runtime==='error'?'ERRO':'PARADO';
        const liveAge=Number(d.liveAgeMs),liveNow=Number.isFinite(liveAge)&&liveAge<3500;
        const liveLabel=analysisStale?'SINCRONIZANDO FEED':analysisTransient?'ATUALIZANDO ANÁLISE':liveNow?'Tempo REAL · AGORA':Number.isFinite(liveAge)?'Tempo REAL · '+(liveAge/1000).toFixed(1)+'s':'AGUARDANDO FEED';
        const analysisAge=Number(d.analysisAgeMs),analysisFresh=runtime==='running'&&!analysisStale&&d.analysisAgeMs!=null&&Number.isFinite(analysisAge)&&analysisAge<3500;
        const planner=d.entryPlanner?.horizons||{};
        const price=v=>{const x=Number(v);if(!Number.isFinite(x))return'—';const a=Math.abs(x),dg=a>=100?3:a>=10?4:5;return x.toFixed(dg)};
        const reasons=(d.reasons||[]).slice(0,4).map(x=>'<div style="margin-top:4px">• '+esc(x)+'</div>').join('');
        const final=d.finalConfluence||{};
        const finalSide=analysisStale?'SINCRONIZANDO':String(final.side||'AGUARDAR').toUpperCase();
        const finalStrength=analysisStale||final.strength==null?null:Math.max(0,Math.min(100,Number(final.strength)));
        const finalCall=analysisStale||final.callStrength==null?null:Math.max(0,Math.min(100,Number(final.callStrength)));
        const finalPut=analysisStale||final.putStrength==null?null:Math.max(0,Math.min(100,Number(final.putStrength)));
        const minConfidence=Math.max(55,Math.min(95,Number(d.minConfidence)||74));
        const stability=q.stability||{},pre=q.preEntry||{};
        const statusCall=buy==null?null:Math.round(buy),statusPut=sell==null?null:Math.round(sell),entryEdge=shortReady&&!analysisStale&&q.technicalEdge!=null?Number(q.technicalEdge):null;
        const preSide=pre.side==='BUY'?'CALL':pre.side==='SELL'?'PUT':null;
        const preRemaining=pre.active===true&&Number.isFinite(Number(pre.expiresAt))?Math.max(0,Math.ceil((Number(pre.expiresAt)-Date.now())/1000)):null;
        const reversalCall=!analysisStale&&short.reversalCallScore!=null?Math.max(0,Math.min(100,Number(short.reversalCallScore))):null;
        const reversalPut=!analysisStale&&short.reversalPutScore!=null?Math.max(0,Math.min(100,Number(short.reversalPutScore))):null;
        const reversalSide=reversalCall==null||reversalPut==null?'AGUARDAR':reversalCall>=reversalPut?'CALL':'PUT';
        const reversalStrength=reversalCall==null||reversalPut==null?null:Math.max(reversalCall,reversalPut);
        const reversalTimer=pre.kind==='reversal'&&preRemaining!=null&&preRemaining>0?preRemaining:null;
        const gateReason=analysisStale||!liveNow?'SINCRONIZANDO':analysisTransient||!analysisFresh?'ATUALIZANDO':entryGateReady?'PRONTO':String(q.blockLabel||q.status||'AGUARDAR');
        const gateDetail=analysisStale?'Feed temporariamente fora de sincronia; aguardando leitura atual.':analysisTransient?'Atualizando a análise sem zerar a última leitura válida.':String(q.blockDetail||'Aguardando confirmação completa da estratégia.');
        let plannerHorizon=el.dataset.plannerHorizon||String(Math.round(duration/1000)),detailsOpen=false,uiTheme=el.dataset.themePreference==='light'?'light':el.dataset.themePreference==='dark'?'dark':'dark';
        try{
          detailsOpen=localStorage.getItem('sentinel-v101-details')==='1';
          if(!el.dataset.themePreference)uiTheme=localStorage.getItem('sentinel-overlay-theme-v1')==='light'?'light':'dark'
        }catch{}
        el.dataset.theme=uiTheme;
        const ink=uiTheme==='light'?'#0f0d0a':'#f7f3e8',muted=uiTheme==='light'?'#39342d':'#c8c0b2',subtle=uiTheme==='light'?'#5b5246':'#9b9385';
        const fieldBg=uiTheme==='light'?'#ffffff':'#0f0f11',fieldInk=uiTheme==='light'?'#0f0d0a':'#f7f3e8',fieldBorder=uiTheme==='light'?'rgba(104,72,24,.48)':'rgba(201,166,91,.34)';
        const panelBg=uiTheme==='light'?'linear-gradient(145deg,#ffffff,#eee7da)':'linear-gradient(145deg,#111113,#070708)';
        const panelBorder=uiTheme==='light'?'rgba(104,72,24,.30)':'rgba(201,166,91,.26)';
        const callTone=uiTheme==='light'?'#086344':'#72e6b9',putTone=uiTheme==='light'?'#922537':'#ff8f9d',warnTone=uiTheme==='light'?'#7b5600':'#f2cf66';
        const finalTone=finalSide==='CALL'?callTone:finalSide==='PUT'?putTone:warnTone;
        Object.assign(el.style,uiTheme==='light'?{background:'linear-gradient(155deg,#fffdf8,#e9e1d3)',color:'#15130f',border:'1px solid rgba(128,94,39,.42)',boxShadow:'0 28px 72px rgba(65,51,28,.22), inset 0 1px #fff'}:{background:'linear-gradient(155deg,#050506,#121214)',color:'#f7f3e8',border:'1px solid rgba(201,166,91,.40)',boxShadow:'0 30px 88px rgba(0,0,0,.78), inset 0 1px rgba(255,255,255,.045)'});
        const setupWindowHtml=preSide&&preRemaining!=null&&preRemaining>0&&!analysisStale?'<div style="margin-top:5px;padding:5px 7px;border-radius:7px;background:'+(uiTheme==='light'?'rgba(128,94,39,.09)':'rgba(201,166,91,.09)')+';border:1px solid '+panelBorder+';color:'+ink+';font-size:8px;font-weight:850;letter-spacing:.03em">JANELA DO SETUP · '+preSide+' · '+preRemaining+'s <span style="font-weight:650;color:'+muted+'">· validade, não contagem para entrar</span></div>':'';
        const plannerPlan=planner[plannerHorizon]||planner['30']||null;
        const horizonLabel=({30:'30 s',60:'1 min',120:'2 min',300:'5 min',600:'10 min',900:'15 min'})[plannerHorizon]||'30 s';
        const entryReady=!analysisTransient&&!analysisStale&&liveNow&&analysisFresh&&entryGateReady&&['BUY','SELL'].includes(side);
        const plannerUsable=!analysisStale&&liveNow&&plannerPlan?.outlookReady&&(analysisFresh||analysisTransient);
        const outlook=plannerUsable?plannerPlan.bias:'SEM LEITURA';
        const outlookTone=outlook==='CALL'?callTone:outlook==='PUT'?putTone:warnTone;
        const planHtml=plannerUsable?(
          '<div style="font-size:8.5px;color:'+muted+';margin-bottom:5px">Preço de referência <b style="color:'+ink+'">'+price(plannerPlan.currentPrice)+'</b> · expiração configurada '+esc(({30:'30 s',60:'1 min',120:'2 min',300:'5 min',600:'10 min',900:'15 min'})[Math.round(duration/1000)]||'—')+'</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">'+
            '<div style="padding:6px 7px;border-radius:8px;background:rgba(105,225,181,.05);border:1px solid rgba(105,225,181,.11)"><div style="font-size:8px;color:'+callTone+';font-weight:800">CALL — gatilho</div><div style="font-size:14px;font-weight:900;color:#69e1b5;margin-top:2px">'+price(plannerPlan.callTrigger)+'</div><div style="font-size:7.5px;color:'+muted+';margin-top:2px">invalida &lt; '+price(plannerPlan.callInvalidation)+'</div></div>'+
            '<div style="padding:6px 7px;border-radius:8px;background:rgba(255,143,156,.05);border:1px solid rgba(255,143,156,.11)"><div style="font-size:8px;color:'+putTone+';font-weight:800">PUT — gatilho</div><div style="font-size:14px;font-weight:900;color:#ff8f9c;margin-top:2px">'+price(plannerPlan.putTrigger)+'</div><div style="font-size:7.5px;color:'+muted+';margin-top:2px">invalida &gt; '+price(plannerPlan.putInvalidation)+'</div></div>'+
          '</div>'+
          '<div style="margin-top:6px;font-size:8px;line-height:1.35;color:'+muted+'"><b style="color:'+ink+'">CALL:</b> '+esc(plannerPlan.callRule||'—')+' · <b style="color:'+ink+'">PUT:</b> '+esc(plannerPlan.putRule||'—')+'</div>'+
          '<div style="margin-top:5px;font-size:8px;line-height:1.3;color:'+muted+'">'+(plannerPlan.outlookReady?'Cenário condicional: '+esc(plannerPlan.basis||'confluência técnica')+'.':'Histórico ou microfluxo insuficiente neste prazo.')+' Os níveis não são previsão garantida nem ordem de entrada.</div>'
        ):'<div style="font-size:9px;color:'+muted+'">Sem níveis acionáveis até a leitura deste prazo ficar atual.</div>';

        if(!el.dataset.controlReady){
          el.dataset.controlReady='1';
          const run=async payload=>{
            const msg=el.querySelector('[data-sentinel-control-msg]');if(msg)msg.textContent='Aplicando…';
            try{const res=await window.__sentinelOverlayAction?.(payload);if(msg)msg.textContent=res?.message||'Aplicado'}
            catch(e){if(msg)msg.textContent='Erro: '+String(e?.message||e)}
          };
          el.addEventListener('pointerdown',ev=>{if(ev.target?.closest?.('select[data-sentinel-setting],select[data-sentinel-plan-horizon]'))el.dataset.selectLock='1'},true);
          el.addEventListener('focusout',ev=>{if(ev.target?.matches?.('select[data-sentinel-setting],select[data-sentinel-plan-horizon]'))setTimeout(()=>{el.dataset.selectLock='0'},160)},true);
          el.addEventListener('change',ev=>{
            const ph=ev.target?.closest?.('[data-sentinel-plan-horizon]');
            if(ph){el.dataset.plannerHorizon=ph.value;setTimeout(()=>{el.dataset.selectLock='0';ph.blur?.()},120);return}
            const x=ev.target?.closest?.('[data-sentinel-setting]');if(!x)return;
            if(x.getAttribute('data-sentinel-setting')==='duration')el.dataset.plannerHorizon=String(Math.round(Number(x.value)/1000));
            run({action:'setting',key:x.getAttribute('data-sentinel-setting'),value:x.value});
            setTimeout(()=>{el.dataset.selectLock='0';x.blur?.()},160)
          });
          el.addEventListener('click',ev=>{
            const theme=ev.target?.closest?.('[data-sentinel-theme]');
            if(theme){ev.preventDefault();ev.stopPropagation();const next=theme.getAttribute('data-sentinel-theme')==='light'?'light':'dark';el.dataset.themePreference=next;el.dataset.theme=next;try{localStorage.setItem('sentinel-overlay-theme-v1',next)}catch{}queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return}
            const a=ev.target?.closest?.('[data-sentinel-action]');
            if(a){ev.preventDefault();ev.stopPropagation();run({action:a.getAttribute('data-sentinel-action')});return}
            const t=ev.target?.closest?.('[data-sentinel-toggle]');
            if(t){ev.preventDefault();const key=t.getAttribute('data-sentinel-toggle'),box=el.querySelector('[data-sentinel-section="'+key+'"]'),open=box?.style.display==='none';if(box)box.style.display=open?'block':'none';const arrow=t.querySelector('[data-sentinel-arrow]');if(arrow)arrow.textContent=open?'⌃':'⌄';try{if(key==='details')localStorage.setItem('sentinel-v101-details',open?'1':'0')}catch{}}
          });
        }

        const rootNode=el.getRootNode?.(),focused=rootNode?.activeElement||document.activeElement;if(el.dataset.selectLock==='1'||(focused&&el.contains(focused)&&focused.matches?.('select')))return;

        
        el.innerHTML=`
          <div data-sentinel-drag style="display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:grab;padding:2px 2px 10px;border-bottom:1px solid ${panelBorder}">
            <div style="display:flex;align-items:center;gap:8px;min-width:0">
              <span style="width:8px;height:8px;border-radius:999px;background:#72e6b9;box-shadow:0 0 13px rgba(114,230,185,.58);flex:0 0 auto"></span>
              <div>
                <div style="font-size:13px;font-weight:950;letter-spacing:.10em;color:${ink}">SENTINEL <span style="color:${subtle};font-weight:750">V${esc(d.agentVersion||'10.13.0')}</span></div>
                <div style="font-size:9px;font-weight:700;color:${muted};margin-top:2px">${esc(String(d.brokerMode||d.mode||'demo').toUpperCase())} · painel de análise</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <div style="display:flex;align-items:center;padding:2px;border-radius:999px;background:${uiTheme==='light'?'rgba(126,101,58,.08)':'rgba(255,255,255,.035)'};border:1px solid ${panelBorder}">
                <button data-sentinel-theme="light" title="Tema claro" style="border:0;border-radius:7px;padding:6px 9px;background:${uiTheme==='light'?'#fff':'transparent'};color:${uiTheme==='light'?'#2b241b':'#8e887f'};font:900 8px/1 inherit;cursor:pointer;box-shadow:${uiTheme==='light'?'0 2px 8px rgba(15,32,40,.12)':'none'}">CLARO</button>
                <button data-sentinel-theme="dark" title="Tema escuro" style="border:0;border-radius:7px;padding:6px 9px;background:${uiTheme==='dark'?'rgba(216,184,94,.14)':'transparent'};color:${uiTheme==='dark'?gold:'#746957'};font:900 8px/1 inherit;cursor:pointer">ESCURO</button>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:.9fr 1.1fr;gap:9px;margin-top:10px">
            <div data-sentinel-role="confluence" style="padding:11px 12px;border-radius:14px;background:${panelBg};border:1px solid ${panelBorder};box-shadow:${uiTheme==='light'?'0 10px 24px rgba(78,56,12,.09)':'0 12px 28px rgba(0,0,0,.28)'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:9px;font-weight:900;letter-spacing:.065em;color:${ink}">CONFLUÊNCIA TÉCNICA</span><span style="font-size:8px;color:${subtle}">DIREÇÃO / CONTEXTO</span></div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px"><b style="font-size:16px;color:${finalTone}">${finalSide}</b><span style="font-size:8px;color:${subtle}">Força <b style="font-size:12px;color:${gold}">${n(finalStrength,0)}%</b></span></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
                <div style="padding:7px 8px;border-radius:9px;background:rgba(114,230,185,.055);border:1px solid rgba(114,230,185,.10);text-align:center"><span style="display:block;font-size:8px;color:${callTone};font-weight:850">CALL</span><b style="display:block;font-size:16px;line-height:1.1;color:${callTone}">${n(finalCall,0)}%</b><small style="display:block;margin-top:3px;font-size:8px;color:${muted}">${n(finalCall,0)} pts</small></div>
                <div style="padding:7px 8px;border-radius:9px;background:rgba(255,143,157,.05);border:1px solid rgba(255,143,157,.10);text-align:center"><span style="display:block;font-size:8px;color:${putTone};font-weight:850">PUT</span><b style="display:block;font-size:16px;line-height:1.1;color:${putTone}">${n(finalPut,0)}%</b><small style="display:block;margin-top:3px;font-size:8px;color:${muted}">${n(finalPut,0)} pts</small></div>
              </div>
            </div>

            <div data-sentinel-role="entry-status" style="padding:11px 12px;border-radius:14px;background:${panelBg};border:1px solid ${entryReady?tone:panelBorder};box-shadow:${uiTheme==='light'?'0 10px 24px rgba(78,56,12,.11)':'0 12px 28px rgba(0,0,0,.30)'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:9px;font-weight:950;letter-spacing:.065em;color:${ink}">PRONTIDÃO DE ENTRADA</span><span style="font-size:8px;font-weight:950;color:${entryReady?callTone:warnTone}">${esc(gateReason)}</span></div>
              <div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:7px">
                <div>
                  <div style="font-size:9px;font-weight:900;color:${callTone}">CALL <b style="font-size:18px">${n(statusCall,0)}%</b></div>
                  <div style="font-size:9px;font-weight:900;color:${putTone};margin-top:4px">PUT <b style="font-size:18px">${n(statusPut,0)}%</b></div>
                </div>
                <div style="text-align:right"><div style="font-size:7.5px;font-weight:900;letter-spacing:.08em;color:${muted}">CONFIANÇA</div><div style="font-size:17px;font-weight:950;color:${entryReady?tone:warnTone}">${n(confidence,0)}%</div><div style="font-size:20px;font-weight:950;line-height:1.05;margin-top:3px;color:${entryReady?tone:warnTone};text-shadow:0 0 18px rgba(216,184,94,.16)">${entryReady?signal:'AGUARDAR'}</div></div>
              </div>
              <div style="margin-top:7px;padding-top:7px;border-top:1px solid ${panelBorder};font-size:8px;line-height:1.4;color:${muted}"><div style="color:${ink};font-weight:750;margin-bottom:3px">${esc(gateDetail)}</div>filtro <b style="color:${ink}">${n(minConfidence,0)} pts</b> · diferença <b style="color:${ink}">${n(entryEdge,0)} pts</b></div>
            </div>
          </div>


          <div data-sentinel-role="reversal" style="margin-top:7px;padding:9px 11px;border-radius:12px;background:${panelBg};border:1px solid ${panelBorder};box-shadow:${uiTheme==='light'?'0 9px 22px rgba(78,56,12,.08)':'0 10px 24px rgba(0,0,0,.24)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <span style="font-size:9px;font-weight:950;letter-spacing:.06em;color:${ink}">VIRADA / REVERSÃO</span>
              <span style="font-size:7.5px;font-weight:850;color:${subtle}">ESTIMATIVA TÉCNICA</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-top:7px">
              <div style="padding:7px 8px;border-radius:9px;background:rgba(114,230,185,.05);border:1px solid rgba(114,230,185,.12);text-align:center">
                <span style="display:block;font-size:8px;font-weight:900;color:${callTone}">VIRADA CALL</span>
                <b style="display:block;font-size:19px;line-height:1.05;color:${callTone}">${n(reversalCall,0)}%</b>
              </div>
              <div style="padding:7px 8px;border-radius:9px;background:rgba(255,143,157,.05);border:1px solid rgba(255,143,157,.12);text-align:center">
                <span style="display:block;font-size:8px;font-weight:900;color:${putTone}">VIRADA PUT</span>
                <b style="display:block;font-size:19px;line-height:1.05;color:${putTone}">${n(reversalPut,0)}%</b>
              </div>
              <div style="min-width:108px;text-align:right">
                <div style="font-size:7px;font-weight:900;letter-spacing:.07em;color:${subtle}">MAIOR SINAL</div>
                <div style="font-size:14px;font-weight:950;color:${reversalSide==='CALL'?callTone:reversalSide==='PUT'?putTone:warnTone}">${reversalStrength==null?'AGUARDAR':reversalSide}</div>
                <div style="font-size:10px;font-weight:900;color:${ink}">${n(reversalStrength,0)}%</div>
              </div>
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid ${panelBorder};display:flex;justify-content:space-between;gap:8px;align-items:center;color:${muted};font-size:8px;line-height:1.35">
              <span>${reversalStrength==null?'Coletando microestrutura para calcular a virada.':reversalStrength>=55?'Sinais de exaustão/reversão relevantes detectados.':'Sem reversão forte confirmada agora.'}</span>
              <b style="white-space:nowrap;color:${reversalTimer!=null?warnTone:subtle}">${reversalTimer!=null?'JANELA '+reversalTimer+'s':'SEM JANELA'}</b>
            </div>
            <div style="margin-top:3px;font-size:7px;color:${subtle}">Percentual = score técnico de reversão, não probabilidade garantida de acerto.</div>
          </div>

          <div data-sentinel-role="horizon-outlook" style="margin-top:7px;padding:7px 9px;border:1px solid rgba(210,174,82,.14);border-left:3px solid ${outlookTone};background:${panelBg};border-radius:10px;box-sizing:border-box">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <div style="font-size:9px;font-weight:900;letter-spacing:.045em;color:${ink}">CENÁRIO POR PRAZO</div>
              <select data-sentinel-plan-horizon title="Prazo do cenário (a expiração da operação é configurada abaixo)" style="height:26px;min-width:82px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:850;outline:none"><option value="30" ${plannerHorizon==='30'?'selected':''}>30 s</option><option value="60" ${plannerHorizon==='60'?'selected':''}>1 min</option><option value="120" ${plannerHorizon==='120'?'selected':''}>2 min</option><option value="300" ${plannerHorizon==='300'?'selected':''}>5 min</option><option value="600" ${plannerHorizon==='600'?'selected':''}>10 min</option><option value="900" ${plannerHorizon==='900'?'selected':''}>15 min</option></select>
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;margin:5px 0 4px;flex-wrap:wrap"><b style="font-size:17px;line-height:1;color:${outlookTone}">${esc(outlook)}</b><span style="color:${muted};font-size:9px;font-weight:650">até ${horizonLabel} · ${liveLabel}</span></div>
            <div style="color:${muted};font-size:9px;font-weight:600;line-height:1.35;margin-bottom:6px">${analysisStale||!liveNow?'Sincronizando leitura ao vivo.':analysisTransient?'Atualizando cenário com a última leitura válida.':!analysisFresh?'Atualizando cálculo deste prazo.':!plannerPlan?.outlookReady?'Aguardando histórico suficiente para este prazo.':outlook==='NEUTRO'?'Sem direção consistente neste prazo. Aguarde confirmação.':`Viés ${outlook} condicionado ao gatilho abaixo; não indica entrada imediata.`}</div>
            ${planHtml}
          </div>

          <div style="margin-top:9px;padding:9px 10px;border-radius:12px;background:${uiTheme==='light'?'rgba(255,255,255,.72)':'rgba(255,255,255,.024)'};border:1px solid ${panelBorder}">
            <div style="font-size:10px;font-weight:900;color:${ink};margin-bottom:7px">Configuração</div>
            <div style="display:grid;grid-template-columns:1.45fr .72fr .72fr;gap:8px">
              <label><span style="display:block;font-size:9px;font-weight:800;color:${muted};margin:0 0 3px 2px">Estratégia</span><select data-sentinel-setting="strategy" style="width:100%;height:34px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:9px;padding:0 9px;font-size:10.5px;font-weight:700;outline:none"><option value="smart_confluence" ${strategy==='smart_confluence'?'selected':''}>Smart Confluence</option><option value="price_action" ${strategy==='price_action'?'selected':''}>Price Action</option><option value="trendline_breakout" ${strategy==='trendline_breakout'?'selected':''}>Trendline Breakout</option><option value="support_resistance" ${strategy==='support_resistance'?'selected':''}>Suporte / Resistência</option><option value="fibonacci_retest" ${strategy==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option><option value="trend" ${strategy==='trend'?'selected':''}>Trend Following</option><option value="mean_reversion" ${strategy==='mean_reversion'?'selected':''}>Mean Reversion</option><option value="breakout" ${strategy==='breakout'?'selected':''}>Breakout</option></select></label>
              <label><span style="display:block;font-size:9px;font-weight:800;color:${muted};margin:0 0 3px 2px">Tempo</span><select data-sentinel-setting="duration" style="width:100%;height:34px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:9px;padding:0 8px;font-size:10.5px;font-weight:750;outline:none"><option value="30000" ${duration===30000?'selected':''}>30 s</option><option value="60000" ${duration===60000?'selected':''}>1 min</option><option value="120000" ${duration===120000?'selected':''}>2 min</option><option value="300000" ${duration===300000?'selected':''}>5 min</option><option value="600000" ${duration===600000?'selected':''}>10 min</option><option value="900000" ${duration===900000?'selected':''}>15 min</option></select></label>
              <label><span style="display:block;font-size:9px;font-weight:800;color:${muted};margin:0 0 3px 2px">Filtro · pontos</span><select data-sentinel-setting="minConfidence" title="Score mínimo de confluência. Não é probabilidade de acerto." style="width:100%;height:34px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:9px;padding:0 8px;font-size:10.5px;font-weight:750;outline:none"><option value="55" ${minConfidence===55?'selected':''}>55 pts</option><option value="60" ${minConfidence===60?'selected':''}>60 pts</option><option value="65" ${minConfidence===65?'selected':''}>65 pts</option><option value="70" ${minConfidence===70?'selected':''}>70 pts</option><option value="75" ${minConfidence===75?'selected':''}>75 pts</option><option value="80" ${minConfidence===80?'selected':''}>80 pts</option><option value="85" ${minConfidence===85?'selected':''}>85 pts</option><option value="90" ${minConfidence===90?'selected':''}>90 pts</option><option value="95" ${minConfidence===95?'selected':''}>95 pts</option></select></label>
            </div>
          </div>

          

          <div data-sentinel-role="bot-controls" style="margin-top:9px;padding:10px 11px;border-radius:14px;background:${panelBg};border:1px solid rgba(210,174,82,.14);box-shadow:0 10px 24px rgba(0,0,0,.16);box-sizing:border-box;overflow:hidden">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px">
              <span style="font-size:9px;font-weight:900;letter-spacing:.04em;color:${ink}">Controle do bot</span>
              <span style="font-size:8px;font-weight:800;line-height:1;color:${runtime==='running'?callTone:runtime==='paused'?warnTone:subtle};padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.055)">${runtimeLabel}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;width:100%;box-sizing:border-box">
              <button data-sentinel-action="start" style="width:100%;min-width:0;height:34px;box-sizing:border-box;border:1px solid rgba(102,205,160,.38);border-radius:8px;background:${runtime==='running'?'linear-gradient(180deg,rgba(45,116,85,.88),rgba(25,76,56,.92))':'rgba(73,160,120,.16)'};color:${uiTheme==='light'?'#17613f':'#baf0d8'};font-family:inherit;font-size:8px;font-weight:800;letter-spacing:.045em;line-height:1;padding:0 7px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden"><span style="font-size:7px;line-height:1">●</span><span style="line-height:1">Iniciar</span></button>
              <button data-sentinel-action="pause" style="width:100%;min-width:0;height:34px;box-sizing:border-box;border:1px solid rgba(201,166,91,.38);border-radius:8px;background:${runtime==='paused'?'linear-gradient(180deg,rgba(111,88,37,.88),rgba(69,53,25,.92))':'rgba(201,166,91,.16)'};color:${runtime==='paused'?goldSoft:(uiTheme==='light'?'#6c572a':'#e5dcc8')};font-family:inherit;font-size:8px;font-weight:800;letter-spacing:.045em;line-height:1;padding:0 7px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden"><span style="font-size:9px;line-height:1">Ⅱ</span><span style="line-height:1">Pausar</span></button>
              <button data-sentinel-action="stop" style="width:100%;min-width:0;height:34px;box-sizing:border-box;border:1px solid rgba(211,111,121,.36);border-radius:8px;background:${runtime==='stopped'?'linear-gradient(180deg,rgba(108,48,56,.84),rgba(68,30,35,.90))':'rgba(190,83,94,.15)'};color:${uiTheme==='light'?'#8b2e3a':'#f2b4bc'};font-family:inherit;font-size:8px;font-weight:800;letter-spacing:.045em;line-height:1;padding:0 7px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;overflow:hidden"><span style="font-size:7px;line-height:1">■</span><span style="line-height:1">Parar</span></button>
            </div>
            <div data-sentinel-control-msg style="min-height:7px;margin:2px 1px 0;font-size:8px;font-weight:700;color:${callTone};line-height:1.1"></div>
          </div>



          <div style="margin-top:7px">
            <button data-sentinel-toggle="details" style="width:100%;border:0;background:transparent;color:${muted};padding:6px 2px;display:flex;justify-content:space-between;cursor:pointer;font-size:8.5px;font-weight:800"><span>Detalhes técnicos</span><span data-sentinel-arrow>${detailsOpen?'⌃':'⌄'}</span></button>
            <div data-sentinel-section="details" style="display:${detailsOpen?'block':'none'};padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.022);font-size:9px;color:${ink}"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px 7px"><div>CALL score <b>${n(buy,0)} pts</b></div><div>PUT score <b>${n(sell,0)} pts</b></div><div>Diferença <b>${n(q.technicalEdge,0)} pts</b></div><div>EMA9 <b>${n(m.fast,5)}</b></div><div>EMA21 <b>${n(m.slow,5)}</b></div><div>RSI <b>${n(m.rsi,1)}</b></div><div>MACD <b>${n(m.macd?.histogram,5)}</b></div><div>ESTOC <b>${n(m.stoch,1)}</b></div><div>ATR <b>${n(m.atr,5)}</b></div></div><div style="margin-top:5px;color:${muted}">${reasons}</div></div>
          </div>

          <div style="height:12px;position:relative"><span style="position:absolute;right:-7px;bottom:-9px;color:${subtle};font-size:18px;pointer-events:none">◢</span></div>

        `;

        requestAnimationFrame(()=>{
          const r=el.getBoundingClientRect();
          if(r.width>window.innerWidth-16)el.style.width=Math.max(390,window.innerWidth-16)+'px';
          if(r.height>window.innerHeight-16)el.style.height=Math.max(360,window.innerHeight-16)+'px';
          const rr=el.getBoundingClientRect();
          if(rr.right>window.innerWidth-8){el.style.left=Math.max(8,window.innerWidth-rr.width-8)+'px';el.style.right='auto'}
          if(rr.bottom>window.innerHeight-8)el.style.top=Math.max(8,window.innerHeight-rr.height-8)+'px';
          if(rr.top<8)el.style.top='8px'
        })
        };
        window.__sentinelRenderOverlay=render;
        render(d)
      },payload);
      return true
    }catch{return false}
  }
  async call(provider,action,{method='POST',body}={}){
    const cfg=this.config(provider);
    if(action==='login'){if(body?.userInitiated!==true)throw new Error('broker_open_requires_manual_action');await this.launchNormal(provider,{manual:true});return{opened:true,label:cfg.label,...await this.sessionInfo(provider)}}
    if(action==='session'){await this.attachAutomation(provider,{manual:true});return this.sessionInfo(provider)}
    if(action==='background'){await this.launchBackground(provider,{force:true});return this.sessionInfo(provider)}
    if(action==='connect'){await this.attachAutomation(provider,{manual:false});const info=await this.sessionInfo(provider);if(!info.open)throw new Error('broker_window_not_open');if(!info.sessionPresent)throw new Error('broker_session_not_detected');await this.domSnapshot(provider).catch(()=>{});await this.requestBaseData(provider).catch(()=>{});await sleep(350);await this.domSnapshot(provider).catch(()=>{});await this.requestMarketData(provider,{force:true}).catch(()=>{});return{connected:true,accountMode:this.state(provider).mode||'unknown',...info}}
    if(action==='disconnect'){const s=await this.session(provider);await this.feeds.get(provider)?.close?.().catch(()=>{});this.feeds.delete(provider);if(s.browser)await s.browser.close().catch(()=>{});killProc(s.normal);killProc(s.cdp);this.sessions.delete(provider);this.last.set(provider,{provider,open:false,sessionPresent:false,likelyAuthenticated:false,url:null,title:null,cookieCount:0,updatedAt:nowIso()});return{connected:false}}
    const snap=await this.domSnapshot(provider);const st=snap.st;
    if(action==='account')return{mode:st.mode||'unknown',provider};
    if(action==='balance'){if(st.balance==null){await this.requestBaseData(provider).catch(()=>{});await sleep(350)}if(st.balance==null)throw new Error(`${provider}_balance_not_found`);return{balance:st.balance,source:st.lastFrameAt?'network':'dom'}}
    if(action==='assets'){const assets=[...st.assets];if(!assets.length&&st.symbol)assets.push(st.symbol);if(!assets.length)throw new Error(`${provider}_assets_not_found`);return assets.map(symbol=>({symbol}))}
    if(action.startsWith('quote?')){const u=new URL('http://x/'+action);const symbol=u.searchParams.get('symbol')||st.symbol;if(st.quote==null)throw new Error(`${provider}_quote_not_found`);return{symbol,price:st.quote,ts:st.lastCandleAt||st.lastFrameAt||st.lastDomAt||Date.now(),source:st.lastFrameAt?'network':'dom'}}
    if(action.startsWith('candles?')){if(st.candles.length<50){await this.requestBaseData(provider).catch(()=>{});await this.requestMarketData(provider,{force:true}).catch(()=>{});await sleep(550)}if(st.candles.length<50)throw new Error(`${provider}_candles_waiting_for_active_stream`);return st.candles.slice(-Number(new URL('http://x/'+action).searchParams.get('limit')||50))}
    if(action==='market-snapshot'){await this.maintain(provider).catch(()=>{});return this.liveStatus(provider);}
    if(action==='orders/demo')return this.placeDemoOrder(provider,body||{});if(action.startsWith('orders/'))throw new Error(`${provider}_real_execution_requires_human_confirmation`);
    throw new Error(`unsupported_driver_action:${provider}:${method}:${action}`);
  }
}
