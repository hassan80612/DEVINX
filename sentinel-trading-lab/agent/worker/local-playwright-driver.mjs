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
  if(/out/.test(direction)&&/candle/i.test(inner||outer)&&activeRaw!=null){const aid=n(activeRaw);if(aid!=null)st.activeId=aid;const sz=n(sizeRaw);if(sz!=null&&sz>0&&sz<=86400)st.candleSize=sz}

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
    const arr=Array.isArray(data?.msg?.data)?data.msg.data:Array.isArray(data?.msg)?data.msg:[];if(arr.length){st.candles=mergeCandles(st.candles,arr);st.lastCandleAt=Date.now();const aid=n(data?.msg?.active_id??data?.msg?.activeId);if(aid!=null)st.activeId=aid;const last=st.candles.at(-1);if(last?.close!=null){st.quote=Number(last.close);st.lastQuoteAt=Date.now()}}
  }
  if(outer==='candle-generated'){
    const c=candleOf(data.msg);if(c){st.candles=mergeCandles(st.candles,[c]);st.lastCandleAt=Date.now();st.quote=Number(c.close);st.lastQuoteAt=Date.now();const aid=n(data?.msg?.active_id??data?.msg?.activeId);if(aid!=null)st.activeId=aid;const sz=n(data?.msg?.size);if(sz!=null&&sz>0)st.candleSize=sz}
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
  constructor({dataDir='worker/data/browser-profiles-v85'}={}){this.dataDir=resolve(dataDir);this.sessions=new Map();this.last=new Map();this.live=new Map();this.feeds=new Map();this.opening=new Map();this.lastManualOpenAt=new Map();this.available=true;this.chromium=null;this.overlayActionHandler=null}
  setOverlayActionHandler(handler){this.overlayActionHandler=typeof handler==='function'?handler:null;return this}
  config(provider){const c=PROVIDERS[provider];if(!c)throw new Error('unsupported_provider');return c}
  state(provider){if(!this.live.has(provider))this.live.set(provider,{balance:null,balanceId:null,balanceSource:null,lastBalances:[],assets:new Set(),activeMap:new Map(),activeId:null,quote:null,symbol:null,uiSymbol:null,candles:[],candleSize:60,lastFrameAt:null,lastDomAt:null,lastQuoteAt:null,lastCandleAt:null,lastRequestAt:null,lastMaintainAt:null,lastRecoveryAt:null,subscribedSymbol:null,subscribedActiveId:null,mode:null,protocol:'passive',directStatus:null,lastDirectError:null,lastCandleRequest:null,lastCandleResponse:null,suggestedSymbol:null,marketStatus:'unknown',marketReason:'Aguardando mercado',autoSelected:false,executionReady:false,executionUi:null});return this.live.get(provider)}
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
    if(page.__sentinelBridgeInstalled)return;
    page.__sentinelBridgeInstalled=true;
    const install=()=>{
      try{
        if(!window.__sentinelBridgeReady){
          window.__sentinelBridgeReady=true;window.__sentinelSockets=[];
          const nativeSend=WebSocket.prototype.send;
          WebSocket.prototype.send=function(data){try{if(!window.__sentinelSockets.includes(this))window.__sentinelSockets.push(this)}catch{}return nativeSend.call(this,data)};
          window.__sentinelSend=(payload,domain)=>{const text=typeof payload==='string'?payload:JSON.stringify(payload);const sockets=(window.__sentinelSockets||[]).filter(ws=>ws&&ws.readyState===1);const preferred=sockets.find(ws=>String(ws.url||'').includes(domain))||sockets.find(ws=>/iqoption|exnova|websocket|socket/i.test(String(ws.url||'')))||sockets[0];if(!preferred)return{ok:false,count:sockets.length,error:'no_open_websocket'};preferred.send(text);return{ok:true,count:sockets.length,url:String(preferred.url||'')}};
        }
        if(!window.__sentinelAssetClickReady){
          window.__sentinelAssetClickReady=true;
          const pairsFrom=(text)=>{
            const raw=String(text||'').toUpperCase();
            const ms=[...raw.matchAll(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})(?:\s*\(?OTC\)?)?/g)];
            return [...new Set(ms.map(m=>`${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`))];
          };
          document.addEventListener('click',ev=>{
            try{
              if(ev.target?.closest?.('#sentinel-trading-overlay'))return;
              const nodes=[];
              let node=ev.target;
              for(let i=0;i<9&&node;i++,node=node.parentElement)nodes.push(node);
              if(Number.isFinite(ev.clientX)&&Number.isFinite(ev.clientY))for(const el of document.elementsFromPoint(ev.clientX,ev.clientY))if(!nodes.includes(el))nodes.push(el);
              for(const el of nodes){
                const ps=pairsFrom(el?.textContent||'');
                if(ps.length===1){window.__sentinelClickedSymbol=ps[0];window.__sentinelClickedSymbolAt=Date.now();break}
              }
            }catch{}
          },true);
        }
      }catch{}
    };
    await page.addInitScript(install).catch(()=>{});
    await page.evaluate(install).catch(()=>{});
  }
  ingest(provider,payload,direction='in'){
    const st=this.state(provider);st.lastFrameAt=Date.now();let data=payload;
    try{if(Buffer.isBuffer(data))data=data.toString('utf8');if(typeof data==='string'){let t=data.trim();if(!(t.startsWith('{')||t.startsWith('['))){const a=t.indexOf('{'),b=t.indexOf('[');const xs=[a,b].filter(x=>x>=0);if(!xs.length)return;t=t.slice(Math.min(...xs))}data=JSON.parse(t)}}catch{return}
    try{protocolScan(data,st,direction)}catch{}
    const out={balanceCandidates:[],modeCandidates:[],assets:new Set(st.assets),activeMap:new Map(st.activeMap),quote:st.quote,symbol:st.symbol,candles:[...st.candles],lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt};
    try{recursiveScan(data,out)}catch{}
    const chosen=chooseCandidate(out.balanceCandidates,st.mode);if(chosen&&st.balance==null){st.balance=chosen.value;st.balanceSource=`network:${chosen.mode||'unknown'}`;if(chosen.mode)st.mode=chosen.mode}
    if(out.modeCandidates?.length&&!st.mode){const strong=out.modeCandidates.filter(x=>Number(x.score||0)>=10);const modes=uniq(strong.map(x=>x.mode).filter(Boolean));if(modes.length===1)st.mode=modes[0]}applyKnownBalance(st)
    st.assets=out.assets;st.activeMap=out.activeMap;if(out.quote!=null){st.quote=out.quote;st.lastQuoteAt=out.lastQuoteAt||Date.now()}st.symbol=out.symbol||st.symbol;st.candles=mergeCandles(st.candles,out.candles);st.lastCandleAt=out.lastCandleAt||st.lastCandleAt;
    if(st.symbol){const id=st.activeMap.get(pairKey(st.symbol));if(id!=null)st.activeId=id}
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
        return{
          buy:!!buy,sell:!!sell,amount:!!amount,
          buyText:buy?desc(buy).slice(0,180):'',
          sellText:sell?desc(sell).slice(0,180):'',
          amountText:amount?desc(amount).slice(0,180):'',
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
      if(!target||!input)return{ok:false,error:'trade_controls_missing',target:!!target,amount:!!input};
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
      }catch(e){return{ok:false,error:'amount_set_failed',detail:String(e?.message||e)}}
      target.click();
      return{ok:true,button:desc(target).slice(0,180),amountControl:desc(input).slice(0,180)}
    },{amount,side});
    if(!result?.ok)throw new Error(result?.error||'demo_order_click_failed');
    st.lastRequestAt=Date.now();
    return{id:`demo-${provider}-${Date.now()}`,provider,asset:st.symbol,side,amount,status:'submitted',openedAt:new Date().toISOString(),referencePrice:st.quote,external:true,button:result.button,amountControl:result.amountControl}
  }
  async maintain(provider){
    const st=this.state(provider),now=Date.now();if(st.lastMaintainAt&&now-st.lastMaintainAt<700)return this.liveStatus(provider);st.lastMaintainAt=now;
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
  async domSnapshot(provider,{allowAttach=false}={}){const s=await this.session(provider);if(!s.page){if(allowAttach)await this.attachAutomation(provider,{manual:true});else throw new Error('broker_browser_not_attached')}const page=s.page;const st=this.state(provider);let text='',title='',url='';try{url=page.url();title=await page.title();text=(await page.locator('body').innerText({timeout:2500})).slice(0,100000)}catch{}
    let accountText='',instrumentText='',clickedSymbol='',clickedAt=0;try{const dom=await page.evaluate(()=>{const visible=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};const els=[...document.querySelectorAll('[aria-selected="true"],[aria-checked="true"],[class*="active"],[class*="selected"],[data-test*="account"],[data-test*="balance"],[data-test*="asset"],[data-test*="instrument"]')].filter(visible);const acct=els.map(el=>String(el.textContent||'').trim()).filter(t=>/practice|prática|demo|real account|conta real|conta de prática|saldo real|practice balance/i.test(t)).slice(0,30);const inst=els.map(el=>String(el.textContent||'').trim()).filter(t=>/[A-Z]{3}\s*[\/-]\s*[A-Z]{3}/i.test(t)).slice(0,30);return{accountText:acct.join(' | '),instrumentText:inst.join(' | '),clickedSymbol:String(window.__sentinelClickedSymbol||''),clickedAt:Number(window.__sentinelClickedSymbolAt||0)}});accountText=dom.accountText||'';instrumentText=dom.instrumentText||'';clickedSymbol=dom.clickedSymbol||'';clickedAt=Number(dom.clickedAt||0)}catch{}
    st.lastDomAt=Date.now();for(const a of pairStrings(text))st.assets.add(a);const mode=detectMode(accountText)||st.mode;if(mode)st.mode=mode;applyKnownBalance(st);const b=bestBalanceFromText(text,st.mode);if(b&&b.value!=null&&b.score>=10&&(!st.mode||!b.mode||b.mode===st.mode)){st.balance=b.value;st.balanceSource=`dom:${b.mode||st.mode||'unknown'}`};
    const clickedFresh=clickedAt>0&&Date.now()-clickedAt<8000;const clickedPairs=clickedFresh&&clickedSymbol?pairStrings(clickedSymbol):[];const activePairs=clickedPairs.length?clickedPairs:pairStrings(instrumentText);
    if(activePairs.length){
      const nextUi=activePairs[0],changed=pairKey(nextUi)!==pairKey(st.uiSymbol||'');
      if(changed){
        st.uiSymbol=nextUi;st.symbol=nextUi;st.activeId=st.activeMap.get(pairKey(nextUi))??null;
        st.candles=[];st.quote=null;st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;
        st.marketStatus='switching';st.marketReason=`Trocando leitura para ${nextUi}`;st.lastRequestAt=null;st.autoSelected=false;
      }else{st.uiSymbol=nextUi;if(!st.autoSelected||pairKey(st.uiSymbol)===pairKey(st.symbol)){st.symbol=st.uiSymbol;st.autoSelected=false}}
    }else if(!st.uiSymbol){const p=pairStrings(text);if(p.length===1){st.uiSymbol=p[0];if(!st.autoSelected)st.symbol=p[0]}}
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
        const id='sentinel-trading-overlay';
        let el=document.getElementById(id);
        if(!el){
          el=document.createElement('div');el.id=id;
          Object.assign(el.style,{
            position:'fixed',right:'14px',top:'14px',zIndex:'2147483647',width:'320px',maxWidth:'calc(100vw - 28px)',
            background:'rgba(13,22,30,.94)',color:'#f4f7f9',border:'1px solid rgba(93,224,186,.42)',borderRadius:'14px',
            boxShadow:'0 18px 50px rgba(0,0,0,.38)',backdropFilter:'blur(12px)',fontFamily:'Inter,Segoe UI,Arial,sans-serif',
            fontSize:'12px',lineHeight:'1.35',padding:'12px',pointerEvents:'auto',userSelect:'none'
          });
          try{
            const saved=JSON.parse(localStorage.getItem('sentinel-overlay-pos-v1')||'null');
            if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
              el.style.left=Math.max(0,Math.min(window.innerWidth-320,saved.x))+'px';
              el.style.top=Math.max(0,Math.min(window.innerHeight-80,saved.y))+'px';
              el.style.right='auto';
            }
            const savedScale=Number(localStorage.getItem('sentinel-overlay-scale-v1')||'1');
            const safeScale=Number.isFinite(savedScale)?Math.max(.65,Math.min(1.15,savedScale)):1;
            el.dataset.scale=String(safeScale);
            el.style.zoom=String(safeScale);
          }catch{}
          document.documentElement.appendChild(el);

          let drag=null;
          const stop=()=>{
            if(!drag)return;
            drag=null;
            el.style.cursor='';
            try{
              const rect=el.getBoundingClientRect();
              localStorage.setItem('sentinel-overlay-pos-v1',JSON.stringify({x:rect.left,y:rect.top}));
            }catch{}
          };
          el.addEventListener('pointerdown',ev=>{
            if(ev.target?.closest?.('[data-sentinel-size]'))return;
            const handle=ev.target?.closest?.('[data-sentinel-drag]');
            if(!handle)return;
            const rect=el.getBoundingClientRect();
            drag={dx:ev.clientX-rect.left,dy:ev.clientY-rect.top};
            el.style.left=rect.left+'px';
            el.style.top=rect.top+'px';
            el.style.right='auto';
            el.style.cursor='grabbing';
            try{el.setPointerCapture(ev.pointerId)}catch{}
            ev.preventDefault();
          });
          el.addEventListener('pointermove',ev=>{
            if(!drag)return;
            const maxX=Math.max(0,window.innerWidth-el.offsetWidth);
            const maxY=Math.max(0,window.innerHeight-el.offsetHeight);
            el.style.left=Math.max(0,Math.min(maxX,ev.clientX-drag.dx))+'px';
            el.style.top=Math.max(0,Math.min(maxY,ev.clientY-drag.dy))+'px';
            ev.preventDefault();
          });
          el.addEventListener('pointerup',stop);
          el.addEventListener('pointercancel',stop);
          window.addEventListener('resize',()=>{
            const rect=el.getBoundingClientRect();
            el.style.left=Math.max(0,Math.min(window.innerWidth-el.offsetWidth,rect.left))+'px';
            el.style.top=Math.max(0,Math.min(window.innerHeight-el.offsetHeight,rect.top))+'px';
            el.style.right='auto';
          });
        }
        const esc=(v)=>String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
        const n=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):'—';
        const m=d.metrics||{},plan=d.plan||{},side=String(d.side||'WAIT').toUpperCase();
        const signal=side==='BUY'?'CALL / COMPRA':side==='SELL'?'PUT / VENDA':'AGUARDAR';
        const tone=side==='BUY'?'#66e0b8':side==='SELL'?'#ff8f9a':'#f2ca68';
        const confidence=Math.max(0,Math.min(100,Number(d.confidence)||0));
        const buyScore=Math.max(0,Math.min(100,Number(m.buyScore)||0));
        const sellScore=Math.max(0,Math.min(100,Number(m.sellScore)||0));
        const reasons=(d.reasons||[]).slice(0,4).map(x=>'<div style="margin-top:3px;color:#aebec8">• '+esc(x)+'</div>').join('');
        const currentScale=Math.max(.65,Math.min(1.15,Number(el.dataset.scale||el.style.zoom||1)||1));
        const durationMs=Number(d.durationMs||60000);
        const intervalMs=Number(d.intervalMs||5000);
        const runtimeState=String(d.state||'stopped').toLowerCase();
        const strategy=String(d.strategy||'smart_confluence');
        if(!el.dataset.controlReady){
          el.dataset.controlReady='1';
          const run=async(payload)=>{
            const msg=el.querySelector('[data-sentinel-control-msg]');
            if(msg)msg.textContent='Aplicando…';
            try{
              const res=await window.__sentinelOverlayAction?.(payload);
              if(msg)msg.textContent=res?.message||'Aplicado';
            }catch(e){if(msg)msg.textContent='Erro: '+String(e?.message||e)}
          };
          el.addEventListener('click',ev=>{
            const btn=ev.target?.closest?.('[data-sentinel-action]');
            if(!btn)return;
            ev.preventDefault();ev.stopPropagation();
            run({action:btn.getAttribute('data-sentinel-action')});
          });
          el.addEventListener('change',ev=>{
            const field=ev.target?.closest?.('[data-sentinel-setting]');
            if(!field)return;
            ev.stopPropagation();
            run({action:'setting',key:field.getAttribute('data-sentinel-setting'),value:field.value});
          });
        }
        if(!el.dataset.sizeControl){
          el.dataset.sizeControl='1';
          el.addEventListener('click',ev=>{
            const btn=ev.target?.closest?.('[data-sentinel-size]');
            if(!btn)return;
            ev.stopPropagation();
            const action=btn.getAttribute('data-sentinel-size');
            const current=Number(el.dataset.scale||el.style.zoom||1)||1;
            const next=action==='reset'?1:action==='down'?Math.max(.65,current-.1):Math.min(1.15,current+.1);
            const fixed=Number(next.toFixed(2));
            el.dataset.scale=String(fixed);
            el.style.zoom=String(fixed);
            try{localStorage.setItem('sentinel-overlay-scale-v1',String(fixed))}catch{} const label=el.querySelector('[data-sentinel-size="reset"]');if(label)label.textContent=Math.round(fixed*100)+'%'
          });
        }
        el.innerHTML=`
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px">
            <div data-sentinel-drag="1" style="flex:1;min-width:0;cursor:grab;touch-action:none;font-size:9px;color:#6f8796;padding:4px 2px">↕ segure aqui para mover</div>
            <div style="display:flex;gap:4px;flex:0 0 auto">
              <button data-sentinel-size="down" title="Diminuir card" style="width:25px;height:22px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(255,255,255,.06);color:#d9e5eb;font-weight:900;cursor:pointer">−</button>
              <button data-sentinel-size="reset" title="Tamanho atual / voltar a 100%" style="width:42px;height:22px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(255,255,255,.06);color:#9db0bd;font-size:9px;cursor:pointer">${Math.round(currentScale*100)}%</button>
              <button data-sentinel-size="up" title="Aumentar card" style="width:25px;height:22px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:rgba(255,255,255,.06);color:#d9e5eb;font-weight:900;cursor:pointer">+</button>
            </div>
          </div>
          <div data-sentinel-drag="1" style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;cursor:grab;touch-action:none;padding-bottom:2px">
            <div style="min-width:0"><div style="font-size:10px;color:#88a2b2;letter-spacing:.08em;font-weight:800">SENTINEL DEMO · ${esc(d.strategy||'—')}</div>
            <div style="font-size:18px;font-weight:900;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.asset||'—')}</div></div>
            <div style="text-align:right;flex:0 0 auto"><div style="font-size:18px;font-weight:900;color:${tone}">${signal}</div><div style="color:#9db0bd">confiança ${n(confidence,0)}%</div></div>
          </div>
          <div style="margin-top:9px;padding:8px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.035)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="display:flex;flex-direction:column;gap:3px"><span style="font-size:9px;color:#89a0ae">ESTRATÉGIA</span>
                <select data-sentinel-setting="strategy" style="width:100%;min-width:0;background:#111d26;color:#e9f1f5;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px;font-size:10px">
                  <option value="smart_confluence" ${strategy==='smart_confluence'?'selected':''}>Smart Confluence</option>
                  <option value="price_action" ${strategy==='price_action'?'selected':''}>Price Action</option>
                  <option value="trendline_breakout" ${strategy==='trendline_breakout'?'selected':''}>Trendline Breakout</option>
                  <option value="support_resistance" ${strategy==='support_resistance'?'selected':''}>Suporte/Resist.</option>
                  <option value="fibonacci_retest" ${strategy==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option>
                  <option value="trend" ${strategy==='trend'?'selected':''}>Trend Following</option>
                  <option value="mean_reversion" ${strategy==='mean_reversion'?'selected':''}>Mean Reversion</option>
                  <option value="breakout" ${strategy==='breakout'?'selected':''}>Breakout</option>
                </select>
              </label>
              <label style="display:flex;flex-direction:column;gap:3px"><span style="font-size:9px;color:#89a0ae">TEMPO DA OPERAÇÃO</span>
                <select data-sentinel-setting="duration" style="width:100%;background:#111d26;color:#e9f1f5;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px;font-size:10px">
                  <option value="30000" ${durationMs===30000?'selected':''}>30 segundos</option>
                  <option value="60000" ${durationMs===60000?'selected':''}>1 minuto</option>
                  <option value="120000" ${durationMs===120000?'selected':''}>2 minutos</option>
                  <option value="300000" ${durationMs===300000?'selected':''}>5 minutos</option>
                  <option value="600000" ${durationMs===600000?'selected':''}>10 minutos</option>
                  <option value="900000" ${durationMs===900000?'selected':''}>15 minutos</option>
                </select>
              </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">
              <label style="display:flex;flex-direction:column;gap:3px"><span style="font-size:9px;color:#89a0ae">ATUALIZAÇÃO</span>
                <select data-sentinel-setting="interval" style="width:100%;background:#111d26;color:#e9f1f5;border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px;font-size:10px">
                  <option value="2000" ${intervalMs===2000?'selected':''}>2 segundos</option>
                  <option value="5000" ${intervalMs===5000?'selected':''}>5 segundos</option>
                  <option value="10000" ${intervalMs===10000?'selected':''}>10 segundos</option>
                  <option value="15000" ${intervalMs===15000?'selected':''}>15 segundos</option>
                </select>
              </label>
              <div style="display:flex;align-items:flex-end;gap:4px">
                <button data-sentinel-action="start" style="flex:1;height:28px;border:0;border-radius:7px;background:#2fbf8f;color:#07140f;font-weight:900;cursor:pointer" ${runtimeState==='running'?'disabled':''}>▶</button>
                <button data-sentinel-action="pause" style="flex:1;height:28px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#1a2934;color:#e7eef2;font-weight:900;cursor:pointer" ${runtimeState!=='running'?'disabled':''}>Ⅱ</button>
                <button data-sentinel-action="stop" style="flex:1;height:28px;border:1px solid rgba(255,143,154,.24);border-radius:7px;background:rgba(255,143,154,.10);color:#ffadb5;font-weight:900;cursor:pointer">■</button>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;gap:8px;margin-top:7px;font-size:10px"><span><b>Bot:</b> ${esc(runtimeState.toUpperCase())}</span><span><b>Próxima:</b> ${esc(d.nextEval||'—')}</span></div>
            <div style="margin-top:5px"><b>Entrada:</b> ${esc(plan.entry||'Aguardar')}</div>
            <div><b>Saída:</b> ${esc(plan.exit||'Sem entrada')}</div>
            <div data-sentinel-control-msg style="min-height:12px;margin-top:4px;font-size:9px;color:#7f9aa9"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-top:9px;color:#d8e3e9">
            <div>EMA 9: <b>${n(m.fast,5)}</b></div><div>EMA 21: <b>${n(m.slow,5)}</b></div>
            <div>EMA 50: <b>${n(m.ema50,5)}</b></div><div>EMA 200: <b>${n(m.ema200,5)}</b></div>
            <div>RSI 14: <b>${n(m.rsi,1)}</b></div><div>MACD H: <b>${n(m.macd?.histogram,5)}</b></div>
            <div>Estoc.: <b>${n(m.stoch,1)}</b></div><div>ATR: <b>${n(m.atr,5)}</b></div>
            <div>Suporte: <b>${n(m.sr?.support,5)}</b></div><div>Resist.: <b>${n(m.sr?.resistance,5)}</b></div>
          </div>
          <div style="margin-top:8px"><b>Estrutura:</b> ${esc(m.structure?.label||'—')}</div>
          <div style="margin-top:7px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <div style="padding:6px;border-radius:8px;background:rgba(102,224,184,.08);border:1px solid rgba(102,224,184,.18)">
              <div style="font-size:9px;color:#86a89d">FORÇA COMPRA</div><b style="font-size:16px;color:#66e0b8">${n(buyScore,0)}%</b>
            </div>
            <div style="padding:6px;border-radius:8px;background:rgba(255,143,154,.08);border:1px solid rgba(255,143,154,.18)">
              <div style="font-size:9px;color:#ae8a90">FORÇA VENDA</div><b style="font-size:16px;color:#ff8f9a">${n(sellScore,0)}%</b>
            </div>
          </div>
          <div style="margin-top:7px;height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
            <div style="height:100%;width:${confidence}%;background:${tone};transition:width .25s ease"></div>
          </div>
          <div style="margin-top:3px;font-size:9px;color:#78909f">Confiança do sinal: ${n(confidence,0)}% · não é probabilidade garantida de lucro.</div>
          ${reasons}
          <div style="margin-top:8px;font-size:10px;color:#78909f">Ajuda visual para teste DEMO. Em conta real, mantenha confirmação manual antes de qualquer ordem.</div>
        `;
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
