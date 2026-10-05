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
    const aid=n(activeRaw);
    if(aid!=null){
      st.activeId=aid;
      const mapped=[...st.activeMap.entries()].find(([,id])=>Number(id)===Number(aid))?.[0]||null;
      if(mapped){
        const found=[...st.assets].find(x=>pairKey(x)===mapped)||(mapped.endsWith('OTC')?`${mapped.slice(0,3)}/${mapped.slice(3,6)} OTC`:`${mapped.slice(0,3)}/${mapped.slice(3,6)}`);
        if(found&&pairKey(found)!==pairKey(st.uiSymbol||'')){
          st.uiSymbol=found;st.symbol=found;st.lastUiSignalAt=Date.now();st.uiSymbolSource='protocol';st.candles=[];st.quote=null;st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;st.marketStatus='switching';st.marketReason=`Ativo alterado na corretora: ${found}`;st.lastRequestAt=null;st.autoSelected=false;
        }
      }
    }
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
  state(provider){if(!this.live.has(provider))this.live.set(provider,{balance:null,balanceId:null,balanceSource:null,lastBalances:[],assets:new Set(),activeMap:new Map(),activeId:null,quote:null,symbol:null,uiSymbol:null,lastUiSignalAt:null,uiSymbolSource:null,candles:[],candleSize:60,lastFrameAt:null,lastDomAt:null,lastQuoteAt:null,lastCandleAt:null,lastRequestAt:null,lastMaintainAt:null,lastRecoveryAt:null,subscribedSymbol:null,subscribedActiveId:null,mode:null,protocol:'passive',directStatus:null,lastDirectError:null,lastCandleRequest:null,lastCandleResponse:null,suggestedSymbol:null,marketStatus:'unknown',marketReason:'Aguardando mercado',autoSelected:false,executionReady:false,executionUi:null});return this.live.get(provider)}
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
              if(ev.target?.closest?.('#sentinel-trading-overlay'))return;
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
              if(ev.target?.closest?.('#sentinel-trading-overlay'))return;
              const ctx=amountContext(ev.target);
              if(ctx){window.__sentinelAmountFocusUntil=Date.now()+12000;window.__sentinelAmountBuffer='';showHint('Digite o valor no teclado')}
              else window.__sentinelAmountFocusUntil=0
            }catch{}
          },true);
          window.addEventListener('keydown',ev=>{
            try{
              if(ev.target?.closest?.('#sentinel-trading-overlay'))return;
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
    if(marketMatches&&out.quote!=null){st.quote=out.quote;st.lastQuoteAt=out.lastQuoteAt||Date.now()}
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
      st.symbol=screenSymbol;st.activeId=st.activeMap.get(pairKey(screenSymbol))??st.activeId;st.candles=[];st.quote=null;st.subscribedSymbol=null;st.subscribedActiveId=null;st.autoSelected=false;st.suggestedSymbol=null;
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
      st.candles=[];st.quote=null;st.lastQuoteAt=null;st.lastCandleAt=null;
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
    if(clickedPairs.length===1){nextUi=clickedPairs[0];uiSource='click'}
    else if(domActive.length===1){nextUi=domActive[0];uiSource='dom-active'}
    else if(instrumentPairs.length===1){nextUi=instrumentPairs[0];uiSource='dom-single'}
    else if(st.uiSymbol&&instrumentPairs.some(x=>pairKey(x)===pairKey(st.uiSymbol))){nextUi=st.uiSymbol;uiSource=st.uiSymbolSource||'preserved'}
    if(nextUi){
      const changed=pairKey(nextUi)!==pairKey(st.uiSymbol||'');
      if(changed){
        st.uiSymbol=nextUi;st.symbol=nextUi;st.activeId=st.activeMap.get(pairKey(nextUi))??null;st.lastUiSignalAt=Date.now();st.uiSymbolSource=uiSource;
        st.candles=[];st.quote=null;st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;
        st.marketStatus='switching';st.marketReason=`Trocando leitura e análise para ${nextUi}`;st.lastRequestAt=null;st.autoSelected=false;
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
    return{balance:st.balance,balanceSource:st.balanceSource,assets:assets.slice(0,500),activeId:st.activeId,quote:st.quote,symbol:st.symbol,uiSymbol:st.uiSymbol,candles:st.candles.slice(-400),mode:st.mode,quoteTs:st.lastQuoteAt||st.lastCandleAt||st.lastFrameAt||st.lastDomAt,lastFrameAt:st.lastFrameAt,lastDomAt:st.lastDomAt,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,latestCandleTs,candleAgeMs,candleFresh,marketStatus,marketReason,autoSelected:!!st.autoSelected,lastRequestAt:st.lastRequestAt,protocol:st.protocol,directStatus:st.directStatus,lastDirectError:st.lastDirectError,lastCandleRequest:st.lastCandleRequest,lastCandleResponse:st.lastCandleResponse,suggestedSymbol:st.suggestedSymbol,feedValidated,executionReady:st.executionReady,executionUi:st.executionUi}
  }
  async updateOverlay(provider,data={}){
    const s=await this.session(provider);if(!s?.page||s.background)return false;
    try{
      const payload=JSON.parse(JSON.stringify(data||{}));
      await s.page.evaluate((d)=>{
        const id='sentinel-trading-overlay';let el=document.getElementById(id);
        if(!el){
          el=document.createElement('section');el.id=id;
          Object.assign(el.style,{
            position:'fixed',right:'10px',top:'10px',zIndex:'2147483647',width:'352px',maxWidth:'calc(100vw - 18px)',
            maxHeight:'calc(100vh - 18px)',overflowY:'auto',overflowX:'hidden',boxSizing:'border-box',overscrollBehavior:'contain',
            background:'linear-gradient(165deg,rgba(7,19,27,.985),rgba(12,30,39,.975))',color:'#f3f8fa',
            border:'1px solid rgba(103,222,188,.28)',borderRadius:'18px',boxShadow:'0 24px 70px rgba(0,0,0,.52)',
            backdropFilter:'blur(16px)',fontFamily:'"Segoe UI Variable Display","Inter","Segoe UI",Arial,sans-serif',
            fontSize:'12px',lineHeight:'1.28',padding:'14px',pointerEvents:'auto',userSelect:'none',scrollbarWidth:'thin'
          });
          try{
            const saved=JSON.parse(localStorage.getItem('sentinel-overlay-pos-v1')||'null');
            if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
              el.style.left=Math.max(8,Math.min(window.innerWidth-340,saved.x))+'px';
              el.style.top=Math.max(8,Math.min(window.innerHeight-100,saved.y))+'px';
              el.style.right='auto'
            }
            const z=Number(localStorage.getItem('sentinel-overlay-scale-v1')||'1');
            const safe=Number.isFinite(z)?Math.max(.65,Math.min(1.15,z)):1;
            el.dataset.scale=String(safe);el.style.zoom=String(safe)
          }catch{}
          document.documentElement.appendChild(el);
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
        const n=(v,dg=0)=>Number.isFinite(Number(v))?Number(v).toFixed(dg):'—';
        const m=d.metrics||{},plan=d.plan||{},q=d.quality||{},f=d.forecast30||{};
        const side=String(d.side||'WAIT').toUpperCase(),raw=String(q.rawSide||side||'WAIT').toUpperCase();
        const validationReady=String(q.status||'').toUpperCase()==='VALIDADO';
        const rawLabel=raw==='BUY'?'CALL':raw==='SELL'?'PUT':'AGUARDAR';
        const signal=validationReady?(side==='BUY'?'CALL':side==='SELL'?'PUT':'AGUARDAR'):(String(q.status||'')?'NÃO ENTRAR':rawLabel);
        const tone=signal==='CALL'?'#69e1b5':signal==='PUT'?'#ff8f9c':signal==='NÃO ENTRAR'?'#f2cb6f':'#f2cb6f';
        const confidence=Math.max(0,Math.min(100,Number(d.confidence)||0));
        const buy=Math.max(0,Math.min(100,Number(m.buyScore)||0)),sell=Math.max(0,Math.min(100,Number(m.sellScore)||0));
        const duration=Number(d.durationMs||60000),strategy=String(d.strategy||'smart_confluence');
        const runtime=String(d.state||'stopped').toLowerCase(),runtimeLabel=runtime==='running'?'ATIVO':runtime==='paused'?'PAUSADO':runtime==='error'?'ERRO':'PARADO';
        const liveAge=Number(d.liveAgeMs),liveNow=Number.isFinite(liveAge)&&liveAge<1200;
        const liveLabel=liveNow?'TEMPO REAL · AGORA':Number.isFinite(liveAge)?'TEMPO REAL · '+(liveAge/1000).toFixed(1)+'s':'AGUARDANDO FEED';
        const fq=q.forecast||f.validation||{},fReady=fq.ready===true,fSide=String(f.side||'WAIT').toUpperCase(),fBias=String(f.biasSide||fSide||'WAIT').toUpperCase();
        const forecast=fReady?(fSide==='BUY'?'CALL':fSide==='SELL'?'PUT':'AGUARDAR'):'EM VALIDAÇÃO';
        const forecastTone=forecast==='CALL'?'#69e1b5':forecast==='PUT'?'#ff8f9c':'#f2cb6f';
        const forecastBias=fBias==='BUY'?'CALL':fBias==='SELL'?'PUT':'AGUARDAR';
        const callStrength=Math.max(0,Math.min(100,Number(f.callStrength)||0)),putStrength=Math.max(0,Math.min(100,Number(f.putStrength)||0));
        const planner=d.entryPlanner?.horizons||{};
        const price=v=>{const x=Number(v);if(!Number.isFinite(x))return'—';const a=Math.abs(x),dg=a>=100?3:a>=10?4:5;return x.toFixed(dg)};
        const reasons=(d.reasons||[]).slice(0,4).map(x=>'<div style="margin-top:4px">• '+esc(x)+'</div>').join('');
        const scale=Math.max(.65,Math.min(1.15,Number(el.dataset.scale||el.style.zoom||1)||1));
        let forecastOpen=true,plannerOpen=false,plannerHorizon='30',detailsOpen=false;
        try{
          forecastOpen=localStorage.getItem('sentinel-v101-forecast')!=='0';
          plannerOpen=localStorage.getItem('sentinel-v102-planner')==='1';
          plannerHorizon=localStorage.getItem('sentinel-v102-planner-horizon')||String(d.entryPlanner?.defaultHorizonSeconds||30);
          detailsOpen=localStorage.getItem('sentinel-v101-details')==='1'
        }catch{}
        const plannerPlan=planner[plannerHorizon]||planner['30']||null;
        const planTone=plannerPlan?.bias==='CALL'?'#69e1b5':plannerPlan?.bias==='PUT'?'#ff8f9c':'#f2cb6f';
        const planHtml=plannerPlan?(
          '<div style="font-size:9px;color:#7f949e;margin-bottom:7px">Preço atual <b style="color:#dce8ed">'+price(plannerPlan.currentPrice)+'</b> · viés <b style="color:'+planTone+'">'+esc(plannerPlan.bias||'NEUTRO')+'</b></div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
            '<div style="padding:9px;border-radius:10px;background:rgba(105,225,181,.055);border:1px solid rgba(105,225,181,.12)"><div style="font-size:9px;color:#8fb7a8;font-weight:850">CALL SE CHEGAR / CONFIRMAR</div><div style="font-size:18px;font-weight:950;color:#69e1b5;margin-top:2px">'+price(plannerPlan.callTrigger)+'</div><div style="font-size:8px;color:#759087;margin-top:3px">invalida abaixo de '+price(plannerPlan.callInvalidation)+'</div></div>'+
            '<div style="padding:9px;border-radius:10px;background:rgba(255,143,156,.055);border:1px solid rgba(255,143,156,.12)"><div style="font-size:9px;color:#bc9499;font-weight:850">PUT SE CHEGAR / CONFIRMAR</div><div style="font-size:18px;font-weight:950;color:#ff8f9c;margin-top:2px">'+price(plannerPlan.putTrigger)+'</div><div style="font-size:8px;color:#96767b;margin-top:3px">invalida acima de '+price(plannerPlan.putInvalidation)+'</div></div>'+
          '</div>'+
          '<div style="margin-top:7px;font-size:9px;color:#8ba0a9"><b>CALL:</b> '+esc(plannerPlan.callRule||'—')+'<br><b>PUT:</b> '+esc(plannerPlan.putRule||'—')+'<br><span style="color:#6f8690">Base: '+esc(plannerPlan.basis||'confluência técnica')+'. Use como gatilho condicional para agendamento manual; não é ordem automática.</span></div>'
        ):'<div style="font-size:9px;color:#8ba0a9">Aguardando dados suficientes para calcular os níveis.</div>';

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
            if(ph){try{localStorage.setItem('sentinel-v102-planner-horizon',ph.value)}catch{};setTimeout(()=>{el.dataset.selectLock='0';ph.blur?.()},120);return}
            const x=ev.target?.closest?.('[data-sentinel-setting]');if(!x)return;
            run({action:'setting',key:x.getAttribute('data-sentinel-setting'),value:x.value});
            setTimeout(()=>{el.dataset.selectLock='0';x.blur?.()},160)
          });
          el.addEventListener('click',ev=>{
            const a=ev.target?.closest?.('[data-sentinel-action]');
            if(a){ev.preventDefault();ev.stopPropagation();run({action:a.getAttribute('data-sentinel-action')});return}
            const z=ev.target?.closest?.('[data-sentinel-size]');
            if(z){ev.preventDefault();ev.stopPropagation();const cur=Number(el.dataset.scale||1)||1,k=z.getAttribute('data-sentinel-size'),next=k==='reset'?1:k==='down'?Math.max(.65,cur-.1):Math.min(1.15,cur+.1);const fixed=Number(next.toFixed(2));el.dataset.scale=String(fixed);el.style.zoom=String(fixed);try{localStorage.setItem('sentinel-overlay-scale-v1',String(fixed))}catch{};const lab=el.querySelector('[data-sentinel-size="reset"]');if(lab)lab.textContent=Math.round(fixed*100)+'%';return}
            const t=ev.target?.closest?.('[data-sentinel-toggle]');
            if(t){ev.preventDefault();const key=t.getAttribute('data-sentinel-toggle'),box=el.querySelector('[data-sentinel-section="'+key+'"]'),open=box?.style.display==='none';if(box)box.style.display=open?'block':'none';const arrow=t.querySelector('[data-sentinel-arrow]');if(arrow)arrow.textContent=open?'⌃':'⌄';try{const sk=key==='forecast'?'sentinel-v101-forecast':key==='planner'?'sentinel-v102-planner':'sentinel-v101-details';localStorage.setItem(sk,open?'1':'0')}catch{}}
          });
        }

        const focused=document.activeElement;if(el.dataset.selectLock==='1'||(focused&&el.contains(focused)&&focused.matches?.('select')))return;

        el.innerHTML=`
          <div data-sentinel-drag style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;cursor:grab;padding-bottom:10px">
            <div style="min-width:0;flex:1">
              <div style="display:flex;align-items:center;gap:6px;font-size:9px;font-weight:900;letter-spacing:.13em;color:#91a7b2"><span style="width:8px;height:8px;border-radius:999px;background:#69e1b5;box-shadow:0 0 12px rgba(105,225,181,.7)"></span>SENTINEL · ${esc(String(d.brokerMode||d.mode||'').toUpperCase())}</div>
              <div style="font-size:10px;font-weight:800;color:#7c929e;margin-top:7px">ATIVO EM ANÁLISE</div>
              <div style="font-size:24px;font-weight:950;line-height:1.03;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.asset||'—')}</div>
            </div>
            <div style="text-align:right;flex:0 0 auto">
              <div style="font-size:10px;font-weight:900;color:#8297a1">STATUS DA ENTRADA</div>
              <div style="font-size:24px;font-weight:950;line-height:1.03;color:${tone};margin-top:2px">${signal}</div>
              <div style="font-size:11px;font-weight:750;color:#b9c8cf;margin-top:4px">viés ${rawLabel} · ${n(confidence,0)}% força</div>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:linear-gradient(90deg,rgba(61,156,144,.18),rgba(44,93,104,.13));border:1px solid rgba(91,189,169,.16);margin-bottom:10px">
            <span style="font-size:11px;font-weight:950;color:${liveNow?'#8bedc8':'#f2cb6f'}">${esc(liveLabel)}</span>
            <span style="font-size:11px;color:#a7bac2">BOT <b style="color:${runtime==='running'?'#8bedc8':runtime==='paused'?'#f2cb6f':'#e3ebee'}">${runtimeLabel}</b></span>
          </div>

          <div style="padding:11px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08)">
            <div style="display:grid;grid-template-columns:1.4fr .75fr;gap:8px">
              <label><span style="display:block;font-size:10px;font-weight:900;color:#97aab3;margin:0 0 5px 2px">ESTRATÉGIA</span><select data-sentinel-setting="strategy" style="width:100%;height:38px;background:#0d202a;color:#f2f7f9;border:1px solid #385360;border-radius:10px;padding:0 10px;font-size:12px;font-weight:750;outline:none"><option value="smart_confluence" ${strategy==='smart_confluence'?'selected':''}>Smart Confluence</option><option value="price_action" ${strategy==='price_action'?'selected':''}>Price Action</option><option value="trendline_breakout" ${strategy==='trendline_breakout'?'selected':''}>Trendline Breakout</option><option value="support_resistance" ${strategy==='support_resistance'?'selected':''}>Suporte / Resistência</option><option value="fibonacci_retest" ${strategy==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option><option value="trend" ${strategy==='trend'?'selected':''}>Trend Following</option><option value="mean_reversion" ${strategy==='mean_reversion'?'selected':''}>Mean Reversion</option><option value="breakout" ${strategy==='breakout'?'selected':''}>Breakout</option></select></label>
              <label><span style="display:block;font-size:10px;font-weight:900;color:#97aab3;margin:0 0 5px 2px">OPERAÇÃO</span><select data-sentinel-setting="duration" style="width:100%;height:38px;background:#0d202a;color:#f2f7f9;border:1px solid #385360;border-radius:10px;padding:0 10px;font-size:12px;font-weight:800;outline:none"><option value="30000" ${duration===30000?'selected':''}>30 s</option><option value="60000" ${duration===60000?'selected':''}>1 min</option><option value="120000" ${duration===120000?'selected':''}>2 min</option><option value="300000" ${duration===300000?'selected':''}>5 min</option><option value="600000" ${duration===600000?'selected':''}>10 min</option><option value="900000" ${duration===900000?'selected':''}>15 min</option></select></label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:10px">
              <button data-sentinel-action="start" style="height:40px;border:0;border-radius:10px;background:linear-gradient(180deg,#74e8bd,#53c99f);color:#071813;font-weight:950;font-size:11px;letter-spacing:.02em;cursor:pointer;box-shadow:inset 0 1px rgba(255,255,255,.3)">▶ INICIAR</button>
              <button data-sentinel-action="pause" style="height:40px;border:1px solid #46606c;border-radius:10px;background:linear-gradient(180deg,#1b3541,#132833);color:#edf5f7;font-weight:950;font-size:11px;cursor:pointer">Ⅱ PAUSAR</button>
              <button data-sentinel-action="stop" style="height:40px;border:1px solid rgba(255,130,145,.45);border-radius:10px;background:linear-gradient(180deg,rgba(121,48,60,.62),rgba(75,29,39,.72));color:#ffb0ba;font-weight:950;font-size:11px;cursor:pointer">■ PARAR</button>
            </div>
            <div data-sentinel-control-msg style="height:12px;margin-top:4px;font-size:9px;font-weight:700;color:#7ebca7"></div>
          </div>

          <div style="margin-top:10px;padding:11px;border-radius:13px;background:rgba(6,17,23,.58);border:1px solid rgba(255,255,255,.07)">
            <div style="font-size:10px;font-weight:950;letter-spacing:.08em;color:#a8bac2">FORÇA TÉCNICA EM TEMPO REAL</div>
            <div style="font-size:9px;color:#718893;margin-top:2px">Força dos indicadores neste instante — não é probabilidade de vitória.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
              <div style="padding:9px 10px;border-radius:10px;background:rgba(105,225,181,.07);border:1px solid rgba(105,225,181,.12)"><div style="font-size:10px;font-weight:850;color:#8fb7a8">CALL / COMPRA</div><div style="font-size:24px;font-weight:950;color:#69e1b5">${n(buy,0)}%</div></div>
              <div style="padding:9px 10px;border-radius:10px;background:rgba(255,143,156,.07);border:1px solid rgba(255,143,156,.12)"><div style="font-size:10px;font-weight:850;color:#bc9499">PUT / VENDA</div><div style="font-size:24px;font-weight:950;color:#ff8f9c">${n(sell,0)}%</div></div>
            </div>
          </div>

          <div style="margin-top:10px;border-radius:13px;background:rgba(242,203,111,.035);border:1px solid rgba(242,203,111,.12);overflow:hidden">
            <button data-sentinel-toggle="forecast" style="width:100%;border:0;background:transparent;color:#f3f7f8;padding:11px 12px;display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer">
              <span><span style="display:block;font-size:10px;font-weight:950;letter-spacing:.08em;color:#b9a96f">PRÓXIMOS 30 SEGUNDOS</span><b style="font-size:23px;color:${forecastTone};line-height:1.1">${forecast}</b> <span style="font-size:11px;color:#a7b6bd">${fReady?n(f.confidence,0)+'%':'viés '+forecastBias}</span></span>
              <span data-sentinel-arrow style="font-size:16px;color:#b9a96f">${forecastOpen?'⌃':'⌄'}</span>
            </button>
            <div data-sentinel-section="forecast" style="display:${forecastOpen?'block':'none'};padding:0 12px 11px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="padding:8px;border-radius:9px;background:rgba(105,225,181,.055)"><div style="font-size:9px;color:#8fb7a8">CALL projetado</div><div style="font-size:18px;font-weight:950;color:#69e1b5">${n(callStrength,0)}%</div></div>
                <div style="padding:8px;border-radius:9px;background:rgba(255,143,156,.055)"><div style="font-size:9px;color:#bc9499">PUT projetado</div><div style="font-size:18px;font-weight:950;color:#ff8f9c">${n(putStrength,0)}%</div></div>
              </div>
              <div style="margin-top:6px;font-size:9px;color:#81949e">${fReady?'Sinal de 30 s liberado pelo filtro interno.':'Ainda coletando confirmação; trate como viés, não como entrada.'}</div>
            </div>
          </div>

          <div style="margin-top:10px;border-radius:13px;background:rgba(74,135,175,.035);border:1px solid rgba(101,164,205,.14);overflow:hidden">
            <button data-sentinel-toggle="planner" style="width:100%;border:0;background:transparent;color:#f3f7f8;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer">
              <span><span style="display:block;font-size:10px;font-weight:950;letter-spacing:.07em;color:#94b7cb">PREVISÃO / GATILHOS DE PREÇO</span><span style="display:block;font-size:9px;color:#718a96;margin-top:2px">Onde observar CALL ou PUT se o preço chegar ao nível</span></span>
              <span data-sentinel-arrow style="font-size:16px;color:#94b7cb">${plannerOpen?'⌃':'⌄'}</span>
            </button>
            <div data-sentinel-section="planner" style="display:${plannerOpen?'block':'none'};padding:0 12px 11px">
              <label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px"><span style="font-size:9px;font-weight:900;color:#8da4af">HORIZONTE</span><select data-sentinel-plan-horizon style="height:32px;min-width:108px;background:#0d202a;color:#f2f7f9;border:1px solid #385360;border-radius:9px;padding:0 9px;font-size:11px;font-weight:800;outline:none"><option value="30" ${plannerHorizon==='30'?'selected':''}>30 s</option><option value="60" ${plannerHorizon==='60'?'selected':''}>1 min</option><option value="120" ${plannerHorizon==='120'?'selected':''}>2 min</option><option value="300" ${plannerHorizon==='300'?'selected':''}>5 min</option><option value="600" ${plannerHorizon==='600'?'selected':''}>10 min</option><option value="900" ${plannerHorizon==='900'?'selected':''}>15 min</option></select></label>
              ${planHtml}
            </div>
          </div>

          <div style="margin-top:9px"><button data-sentinel-toggle="details" style="width:100%;border:0;background:transparent;color:#a6b8c0;padding:7px 3px;display:flex;justify-content:space-between;cursor:pointer;font-size:10px;font-weight:900"><span>DETALHES TÉCNICOS</span><span data-sentinel-arrow>${detailsOpen?'⌃':'⌄'}</span></button><div data-sentinel-section="details" style="display:${detailsOpen?'block':'none'};padding:9px;border-radius:10px;background:rgba(255,255,255,.025);font-size:9px;color:#b4c3ca"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 8px"><div>EMA9 <b>${n(m.fast,5)}</b></div><div>EMA21 <b>${n(m.slow,5)}</b></div><div>RSI <b>${n(m.rsi,1)}</b></div><div>MACD <b>${n(m.macd?.histogram,5)}</b></div><div>ESTOC <b>${n(m.stoch,1)}</b></div><div>ATR <b>${n(m.atr,5)}</b></div></div><div style="margin-top:6px;color:#8ea2ac">${reasons}</div></div></div>

          <div style="position:sticky;bottom:-14px;margin:10px -14px -14px;padding:9px 14px 10px;background:linear-gradient(180deg,rgba(8,20,27,.88),rgba(8,20,27,.995));border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-size:9px;font-weight:850;color:#768c97">TAMANHO DO CARD</span>
            <div style="display:flex;gap:5px"><button data-sentinel-size="down" title="Diminuir" style="width:31px;height:27px;border:1px solid #344d59;border-radius:8px;background:#112630;color:#e3edf1;font-weight:950;cursor:pointer">−</button><button data-sentinel-size="reset" title="Restaurar" style="width:50px;height:27px;border:1px solid #344d59;border-radius:8px;background:#112630;color:#b9c9d0;font-size:10px;font-weight:850;cursor:pointer">${Math.round(scale*100)}%</button><button data-sentinel-size="up" title="Aumentar" style="width:31px;height:27px;border:1px solid #344d59;border-radius:8px;background:#112630;color:#e3edf1;font-weight:950;cursor:pointer">+</button></div>
          </div>
        `;

        requestAnimationFrame(()=>{
          const r=el.getBoundingClientRect();
          if(r.right>window.innerWidth-8){el.style.left=Math.max(8,window.innerWidth-r.width-8)+'px';el.style.right='auto'}
          if(r.top<8)el.style.top='8px';
          if(r.bottom>window.innerHeight-8&&r.height<window.innerHeight-16)el.style.top=Math.max(8,window.innerHeight-r.height-8)+'px'
        })
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
