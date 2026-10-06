// V13 deployment checkpoint: preserved reading driver + V3 forecast UI
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
function assetStrings(text=''){
  const out=[...pairStrings(text)],raw=String(text||'').toUpperCase();
  const named=[['GOLD','Gold'],['SILVER','Silver'],['BITCOIN','Bitcoin'],['ETHEREUM','Ethereum'],['CRUDE OIL','Crude Oil'],['NATURAL GAS','Natural Gas']];
  for(const [needle,label] of named){
    const rx=new RegExp('(^|[^A-Z])'+needle.replace(' ','\\s+')+'([^A-Z]|$)','i');
    if(rx.test(raw))out.push(label+(raw.includes('OTC')?' OTC':''));
  }
  return uniq(out)
}
function pairKey(v=''){return String(v).toUpperCase().replace(/\s*\(?OTC\)?$/,'-OTC').replace(/[^A-Z]/g,'')}
function symbolForActiveId(st,activeId){
  const aid=Number(activeId);if(!Number.isFinite(aid))return null;
  const keys=[...st.activeMap.entries()].filter(([,id])=>Number(id)===aid).map(([key])=>String(key));
  if(!keys.length)return null;
  for(const key of keys){
    const found=[...st.assets].find(x=>pairKey(x)===key);
    if(found)return found
  }
  return null
}
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
function marketRequestId(data){return String(data?.request_id??data?.requestId??'').trim()}
function pruneMarketRequests(st,now=Date.now()){
  if(!(st.marketRequests instanceof Map))st.marketRequests=new Map();
  for(const [id,row] of st.marketRequests)if(!row||now-Number(row.at||0)>20000)st.marketRequests.delete(id);
  while(st.marketRequests.size>240)st.marketRequests.delete(st.marketRequests.keys().next().value)
}
function requestedActiveId(st,data){
  pruneMarketRequests(st);
  const id=marketRequestId(data);if(!id)return null;
  const row=st.marketRequests.get(id);if(!row)return null;
  return Number.isFinite(Number(row.activeId))?Number(row.activeId):null
}
function candleSeriesIntegrity(candles=[],quote=null){
  const rows=(Array.isArray(candles)?candles:[]).map(candleOf).filter(Boolean);
  if(!rows.length)return{ok:false,reason:'sem_candles'};
  const rel=[];
  for(let i=1;i<rows.length;i++){
    const a=Number(rows[i-1].close),b=Number(rows[i].open??rows[i].close);
    if(a>0&&b>0)rel.push(Math.abs(b-a)/Math.max(Math.abs(a),1e-12))
  }
  const sorted=rel.filter(Number.isFinite).sort((a,b)=>a-b);
  const median=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
  const limit=Math.max(.08,median*25);
  for(let i=1;i<rows.length;i++){
    const a=Number(rows[i-1].close),b=Number(rows[i].open??rows[i].close);
    if(!(a>0&&b>0))return{ok:false,reason:'preco_invalido',index:i};
    const gap=Math.abs(b-a)/Math.max(Math.abs(a),1e-12);
    if(gap>limit)return{ok:false,reason:'salto_incompativel',index:i,gapPct:Math.round(gap*10000)/100,limitPct:Math.round(limit*10000)/100}
  }
  const last=Number(rows.at(-1)?.close),q=Number(quote);
  if(Number.isFinite(q)&&q>0&&last>0){
    const gap=Math.abs(q-last)/Math.max(Math.abs(last),1e-12);
    if(gap>Math.max(.08,median*25))return{ok:false,reason:'cotacao_diverge_dos_candles',gapPct:Math.round(gap*10000)/100}
  }
  return{ok:true,reason:'ok',medianMovePct:Math.round(median*100000)/1000}
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
  const command=`${outer} ${inner}`.toLowerCase();
  const marketCommand=/get-candles|candle-generated|instrument-quotes|quote-generated|subscribe.*candle|subscribe.*quote|^candles$/.test(command);
  const pageSelectionCommand=/get-candles/.test(command);
  const outboundMarket=/(?:page|direct)-out/.test(direction)&&activeRaw!=null&&marketCommand;
  if(outboundMarket){
    const aid=n(activeRaw),rid=marketRequestId(data);
    if(aid!=null&&rid){pruneMarketRequests(st);st.marketRequests.set(rid,{activeId:Number(aid),size:n(sizeRaw),at:Date.now(),direction,command})}
  }
  if(/page-out/.test(direction)&&activeRaw!=null){
    const aid=n(activeRaw);
    if(aid!=null&&pageSelectionCommand){
      const prevPageId=n(st.pageActiveId),prevActiveId=n(st.activeId);
      const activeChanged=(prevPageId!=null&&Number(prevPageId)!==Number(aid))||(prevPageId==null&&prevActiveId!=null&&Number(prevActiveId)!==Number(aid));
      st.pageActiveId=aid;st.lastPageActiveAt=Date.now();
      if(activeChanged&&prevActiveId!=null&&Number(prevActiveId)!==Number(aid)){
        const resolved=symbolForActiveId(st,aid);
        st.activeId=Number(aid);st.pendingPageActiveId=Number(aid);
        st.symbol=resolved||null;st.uiSymbol=resolved||null;st.uiSymbolSource=resolved?'protocol-page':'protocol-page-pending';
        st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'active_id_switch'};
        st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;st.lastRequestAt=null;
        st.marketStatus='switching';st.marketReason=resolved?`Ativo alterado na corretora: ${resolved}`:'Ativo alterado na corretora · identificando novo ativo';
      }
      const selected=st.uiSymbol||st.symbol||null;
      if(selected&&Number(st.activeId)===Number(aid)){const key=pairKey(selected);st.activeMap.set(key,aid);st.assets.add(selected);st.pendingPageActiveId=null}
      const sz=n(sizeRaw);if(sz!=null&&[5,10,15,30,60,300,900,1800,3600].includes(Number(sz)))st.candleSize=Number(sz)
    }
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
    const rid=marketRequestId(data),explicitAid=n(data?.msg?.active_id??data?.msg?.activeId),correlatedAid=requestedActiveId(st,data),aid=explicitAid??correlatedAid;
    const arr=Array.isArray(data?.msg?.candles)?data.msg.candles:Array.isArray(data?.msg?.data)?data.msg.data:Array.isArray(data?.msg)?data.msg:[];
    const matches=st.activeId!=null&&aid!=null&&Number(aid)===Number(st.activeId);
    if(matches&&arr.length){
      st.activeId=Number(aid);st.candleActiveId=Number(aid);st.candles=mergeCandles(st.candles,arr);st.lastCandleAt=Date.now();
      const integrity=candleSeriesIntegrity(st.candles,st.quote);st.candleIntegrity=integrity;
      if(!integrity.ok){st.lastIntegrityError={...integrity,at:Date.now(),activeId:Number(aid),symbol:st.symbol};st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1;st.candles=[];st.quote=null;st.quoteHistory=[];st.candleActiveId=null;st.marketStatus='recovering';st.marketReason='Histórico rejeitado por mistura/inconsistência de ativo'}
      else{const last=st.candles.at(-1);if(last?.close!=null){st.quote=Number(last.close);st.lastQuoteAt=Date.now();const prev=st.quoteHistory?.at?.(-1);if(!prev||prev.price!==st.quote||Date.now()-Number(prev.ts||0)>=250)st.quoteHistory=[...(st.quoteHistory||[]),{ts:Date.now(),price:st.quote}].slice(-1800)}}
    }else if(arr.length){st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1}
    if(rid)st.marketRequests?.delete?.(rid)
  }
  if(outer==='candle-generated'){
    const aid=n(data?.msg?.active_id??data?.msg?.activeId);
    const matches=st.activeId!=null&&aid!=null&&Number(aid)===Number(st.activeId);
    const candle=candleOf(data.msg);
    if(matches&&candle){
      st.activeId=Number(aid);st.candleActiveId=Number(aid);const candidate=mergeCandles(st.candles,[candle]);const integrity=candleSeriesIntegrity(candidate,candle.close);st.candleIntegrity=integrity;
      if(!integrity.ok){st.lastIntegrityError={...integrity,at:Date.now(),activeId:Number(aid),symbol:st.symbol};st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1;st.candles=[];st.quote=null;st.quoteHistory=[];st.candleActiveId=null;st.marketStatus='recovering';st.marketReason='Candle rejeitada por inconsistência de ativo'}
      else{st.candles=candidate;st.lastCandleAt=Date.now();st.quote=Number(candle.close);st.lastQuoteAt=Date.now();const prev=st.quoteHistory?.at?.(-1);if(!prev||prev.price!==st.quote||Date.now()-Number(prev.ts||0)>=250)st.quoteHistory=[...(st.quoteHistory||[]),{ts:Date.now(),price:st.quote}].slice(-1800);const sz=n(data?.msg?.size);if(sz!=null&&[5,10,15,30,60,300,900,1800,3600].includes(Number(sz)))st.candleSize=Number(sz)}
    }else if(candle){st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1}
  }
  if(/quote|ticker/i.test(outer)||/quote|ticker/i.test(inner)){
    const rows=Array.isArray(data?.msg)?data.msg:Array.isArray(data?.msg?.data)?data.msg.data:[data?.msg||data];
    const messageAid=n(data?.msg?.active_id??data?.msg?.activeId??body?.active_id??body?.activeId)??requestedActiveId(st,data);
    for(const row of rows.slice(0,500)){
      if(!row||typeof row!=='object')continue;
      const aid=n(row.active_id??row.activeId??row.instrument_active_id??row.asset_id)??messageAid;
      if(st.activeId==null||aid==null||Number(aid)!==Number(st.activeId)){st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1;continue}
      const bid=n(row.bid),ask=n(row.ask),q=n(row.price??row.value??row.close??row.current_price??row.spot_price)??(bid!=null&&ask!=null?(bid+ask)/2:bid??ask);
      if(q==null)continue;
      const rawTs=n(row.quote_time??row.time??row.timestamp??row.at??row.created_at),ts=rawTs==null?Date.now():(rawTs<1e12?rawTs*1000:rawTs);
      st.quote=Number(q);st.lastQuoteAt=ts;const prev=st.quoteHistory?.at?.(-1);if(!prev||prev.price!==st.quote||ts-Number(prev.ts||0)>=250)st.quoteHistory=[...(st.quoteHistory||[]),{ts,price:st.quote}].slice(-1800)
    }
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
  if(typeof obj==='string'){for(const p of assetStrings(obj))out.assets.add(p);return}
  if(typeof obj!=='object')return;
  if(Array.isArray(obj)){
    const candleLike=obj.map(candleOf).filter(Boolean);
    if(candleLike.length>=5)out.candles=mergeCandles(out.candles,candleLike);
    for(const v of obj.slice(0,2000))recursiveScan(v,out,hint);return;
  }
  const keys=Object.keys(obj),objectMode=inferObjectMode(obj,hint);
  if(objectMode){out.modeCandidates=out.modeCandidates||[];out.modeCandidates.push({mode:objectMode,score:/balance|account|profile/.test(hint)?12:6})}
  const localHint=(hint+' '+String(obj.name??obj.type??obj.event??obj.method??obj.action??obj.account_type??obj.accountMode??'')).toLowerCase();
  const ownPairs=uniq(keys.flatMap(k=>typeof obj[k]==='string'?assetStrings(obj[k]):[]));
  const possibleId=n(obj.active_id??obj.activeId??obj.instrument_active_id??obj.asset_id??((ownPairs.length||/active|instrument|asset|underlying/.test(localHint))?obj.id:null));
  if(possibleId!=null&&ownPairs.length){for(const p of ownPairs){out.activeMap.set(pairKey(p),possibleId);out.assets.add(p)}}
  for(const k of keys){const v=obj[k],kl=k.toLowerCase();
    if(typeof v==='string'){for(const p of assetStrings(v))out.assets.add(p)}
    if(/balance|equity/.test(kl)||(/amount|value/.test(kl)&&/balance|account|wallet|portfolio/.test(localHint))){const val=n(v);if(val!=null&&val>=0&&val<1e9){out.balanceCandidates.push({value:val,mode:objectMode,score:/balance/.test(kl)?8:/equity/.test(kl)?6:2,hint:localHint.slice(-180)})}}
    if(['symbol','ticker','instrument','asset','active'].includes(kl)&&typeof v==='string'){const ps=assetStrings(v);for(const p of ps)out.assets.add(p);if(ps[0])out.symbol=ps[0]}
    if(['price','quote','bid','ask','close','value'].includes(kl)&&/quote|instrument|candle|price|tick|active/.test(localHint)){const val=n(v);if(val!=null&&val>0&&val<1e8){out.quote=val;out.lastQuoteAt=Date.now()}}
  }
  const oneCandle=candleOf(obj);if(oneCandle){out.candles=mergeCandles(out.candles,[oneCandle]);out.lastCandleAt=Date.now()}
  for(const v of Object.values(obj))recursiveScan(v,out,localHint);
}

export class LocalPlaywrightDriver{
  constructor({dataDir='worker/data/browser-profiles-v85'}={}){this.dataDir=resolve(dataDir);this.sessions=new Map();this.last=new Map();this.live=new Map();this.feeds=new Map();this.opening=new Map();this.lastManualOpenAt=new Map();this.available=true;this.chromium=null;this.overlayActionHandler=null;this.marketUpdateHandler=null;this.overlayDisplay=new Map()}
  setOverlayActionHandler(handler){this.overlayActionHandler=typeof handler==='function'?handler:null;return this}
  setMarketUpdateHandler(handler){this.marketUpdateHandler=typeof handler==='function'?handler:null;return this}
  config(provider){const c=PROVIDERS[provider];if(!c)throw new Error('unsupported_provider');return c}
  state(provider){if(!this.live.has(provider))this.live.set(provider,{balance:null,balanceId:null,balanceSource:null,lastBalances:[],assets:new Set(),activeMap:new Map(),activeId:null,quote:null,symbol:null,uiSymbol:null,lastUiSignalAt:null,uiSymbolSource:null,candles:[],quoteHistory:[],candleSize:60,lastFrameAt:null,lastDomAt:null,lastQuoteAt:null,lastCandleAt:null,lastRequestAt:null,lastMaintainAt:null,lastRecoveryAt:null,subscribedSymbol:null,subscribedActiveId:null,mode:null,protocol:'passive',directStatus:null,lastDirectError:null,lastCandleRequest:null,lastCandleResponse:null,pageActiveId:null,lastPageActiveAt:null,pendingPageActiveId:null,marketRequests:new Map(),candleActiveId:null,candleIntegrity:{ok:false,reason:'sem_candles'},rejectedMarketFrames:0,lastIntegrityError:null,suggestedSymbol:null,marketStatus:'unknown',marketReason:'Aguardando mercado',autoSelected:false,executionReady:false,executionUi:null,expirationDurationMs:null,expirationRaw:null,expirationKind:null,expirationConfidence:0,expirationUpdatedAt:null});return this.live.get(provider)}
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
      const startupUrl=String(s.page.url()||'');
      await this.installBridge(s.page,provider);this.attachNetwork(provider,s.page);
      if(!startupUrl.includes(cfg.domain)||!/traderoom|platform|trade/i.test(startupUrl))await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:30000});
      else await s.page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
      await this.installBridge(s.page,provider).catch(()=>{});
      await sleep(180);
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
      const startupUrl=String(s.page.url()||'');
      await this.installBridge(s.page,provider);this.attachNetwork(provider,s.page);
      if(!startupUrl.includes(cfg.domain)||!/traderoom|platform|trade/i.test(startupUrl))await s.page.goto(cfg.tradeUrl,{waitUntil:'domcontentloaded',timeout:30000});
      else await s.page.reload({waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
      await this.installBridge(s.page,provider).catch(()=>{});
      await sleep(180);
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
            const codes=new Set(['USD','EUR','GBP','JPY','AUD','NZD','CAD','CHF','BRL','TRY','ZAR','MXN','SGD','HKD','NOK','SEK','DKK','PLN','CZK','HUF','THB','BTC','ETH','XAU','XAG']);
            const out=[];
            for(const m of raw.matchAll(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})(?:\s*\(?OTC\)?)?/g))if(codes.has(m[1])||codes.has(m[2]))out.push(`${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`);
            for(const m of raw.matchAll(/\b([A-Z]{3})([A-Z]{3})(?:-?OTC)?\b/g))if(codes.has(m[1])||codes.has(m[2]))out.push(`${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`);
            const named=[['GOLD','Gold'],['SILVER','Silver'],['BITCOIN','Bitcoin'],['ETHEREUM','Ethereum'],['CRUDE OIL','Crude Oil'],['NATURAL GAS','Natural Gas']];
            for(const [needle,label] of named)if(new RegExp('(^|[^A-Z])'+needle.replace(' ','\\\\s+')+'([^A-Z]|$)','i').test(raw))out.push(label+(raw.includes('OTC')?' OTC':''));
            return [...new Set(out)];
          };
          const selectedPair=()=>{
            const selectors='[aria-selected],[aria-checked],[aria-current],[data-state],[role="tab"],[class*="tab"],[data-test*="tab" i],[data-testid*="tab" i],[data-test*="asset" i],[data-testid*="asset" i],[data-test*="instrument" i],[data-testid*="instrument" i]';
            const visible=el=>{try{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>8&&r.height>8}catch{return false}};
            const stateScore=el=>{let score=0,node=el;for(let d=0;d<5&&node;d++,node=node.parentElement){const cls=String(node.className||'').toLowerCase(),state=String(node.getAttribute?.('data-state')||'').toLowerCase(),cur=String(node.getAttribute?.('aria-current')||'').toLowerCase();if(node.getAttribute?.('aria-selected')==='true')score+=120;if(node.getAttribute?.('aria-checked')==='true')score+=110;if(cur&&cur!=='false')score+=100;if(/active|selected|current|checked/.test(state))score+=90;if(/(^|[ _-])(active|selected|current)([ _-]|$)/.test(cls))score+=75;try{const cs=getComputedStyle(node);if(parseFloat(cs.borderBottomWidth||'0')>=2&&cs.borderBottomColor!=='rgba(0, 0, 0, 0)'&&cs.borderBottomColor!=='transparent')score+=18}catch{}}const r=el.getBoundingClientRect();if(r.top<180)score+=5;return score};
            const ranked=[];
            for(const el of [...document.querySelectorAll(selectors)].filter(visible)){const p=pairsFrom(el.textContent||'');if(p.length===1)ranked.push({p:p[0],score:stateScore(el)})}
            ranked.sort((a,b)=>b.score-a.score);
            return ranked[0]?.score>0?ranked[0].p:''
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
          // Do not continuously walk the IQ DOM. The broker websocket active_id is
          // authoritative for asset switches; this bridge is only a lightweight click hint.
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
    // IQ Option can keep already-open asset tabs inside child frames. Installing the
    // listener only in the top document makes "+ adicionar ativo" work while a click
    // on an existing tab can be missed. Install the same bridge in every current frame.
    for(const frame of page.frames()){
      if(frame===page.mainFrame())continue;
      await frame.evaluate(install).catch(()=>{});
    }
    if(!page.__sentinelFrameBridgeHooks){
      page.__sentinelFrameBridgeHooks=true;
      const installFrame=frame=>{if(frame===page.mainFrame())return;frame.evaluate(install).catch(()=>{})};
      page.on('frameattached',installFrame);
      page.on('framenavigated',installFrame);
    }
  }
  ingest(provider,payload,direction='in'){
    const st=this.state(provider);const before={quote:st.quote,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,activeId:st.activeId,symbol:st.symbol,lastClose:st.candles.at(-1)?.close,lastPageActiveAt:st.lastPageActiveAt};st.lastFrameAt=Date.now();let data=payload;
    try{if(Buffer.isBuffer(data))data=data.toString('utf8');if(typeof data==='string'){let t=data.trim();if(!(t.startsWith('{')||t.startsWith('['))){const a=t.indexOf('{'),b=t.indexOf('[');const xs=[a,b].filter(x=>x>=0);if(!xs.length)return;t=t.slice(Math.min(...xs))}data=JSON.parse(t)}}catch{return}
    try{protocolScan(data,st,direction)}catch{}
    const out={balanceCandidates:[],modeCandidates:[],assets:new Set(st.assets),activeMap:new Map(st.activeMap),quote:null,symbol:null,candles:[],lastQuoteAt:null,lastCandleAt:null};
    try{recursiveScan(data,out)}catch{}
    const chosen=chooseCandidate(out.balanceCandidates,st.mode);if(chosen&&st.balance==null){st.balance=chosen.value;st.balanceSource=`network:${chosen.mode||'unknown'}`;if(chosen.mode)st.mode=chosen.mode}
    if(out.modeCandidates?.length&&!st.mode){const strong=out.modeCandidates.filter(x=>Number(x.score||0)>=10);const modes=uniq(strong.map(x=>x.mode).filter(Boolean));if(modes.length===1)st.mode=modes[0]}applyKnownBalance(st)
    st.assets=out.assets;st.activeMap=out.activeMap;
    if(st.pageActiveId!=null){
      const resolvedPageSymbol=symbolForActiveId(st,st.pageActiveId);
      if(resolvedPageSymbol)this.applyActiveSelection(provider,{activeId:st.pageActiveId,source:'protocol-page-late'});
    }
    if(st.symbol){
      const mappedId=st.activeMap.get(pairKey(st.symbol));
      if(mappedId!=null){
        const idChanged=st.activeId==null||Number(st.activeId)!==Number(mappedId);
        st.activeId=Number(mappedId);
        if(st.candles.length<50&&(idChanged||!st.lastCandleRequest))setTimeout(()=>this.requestMarketData(provider,{force:true}).catch(()=>{}),0);
      }
    }
    if(!st.symbol&&st.activeId!=null){
      const resolved=symbolForActiveId(st,st.activeId);
      if(resolved){
        st.symbol=resolved;st.uiSymbol=resolved;st.uiSymbolSource='active-map';st.lastUiSignalAt=Date.now();
        st.marketStatus='syncing';st.marketReason=`Ativo ${resolved} identificado · carregando histórico`;
        if(st.subscribedSymbol==null)st.subscribedSymbol=resolved;
        if(st.subscribedActiveId==null)st.subscribedActiveId=Number(st.activeId);
        if(st.candles.length<50&&(!st.lastRequestAt||Date.now()-Number(st.lastRequestAt)>1200)){
          st.lastRequestAt=Date.now();
          setTimeout(()=>this.requestMarketData(provider,{force:true}).catch(()=>{}),0)
        }
      }
    }
    // protocolScan already applies only real page get-candles selection changes.
    // Background candle/quote subscriptions are deliberately ignored for retargeting.
    // Market prices/candles are accepted only by protocolScan for the selected active_id.
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
    const targetId=activeId??st.activeMap.get(pairKey(targetSymbol));if(targetId==null)return false;
    const size=Number(st.candleSize||60),changed=st.subscribedSymbol!==targetSymbol||String(st.subscribedActiveId)!==String(targetId);
    if(changed&&st.subscribedActiveId!=null){
      await this.wsSend(provider,{name:'unsubscribeMessage',msg:{name:'candle-generated',version:'2.0',params:{routingFilters:{active_id:Number(st.subscribedActiveId),size}}},request_id:reqId('unsub')}).catch(()=>{});
    }
    if(changed){st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'asset_switch'}}
    st.symbol=targetSymbol;st.activeId=Number(targetId);
    if(changed||force||st.candles.length<50){
      const feed=await this.directFeed(provider).catch(()=>null);
      const now=feed?.serverTimeSeconds?.()||Math.floor(Date.now()/1000);
      const rid=reqId('candles');
      const modern={name:'sendMessage',msg:{name:'get-candles',version:'2.0',body:{active_id:Number(targetId),size,to:now,count:200}},request_id:rid};
      st.lastCandleRequest={transport:'modern',symbol:targetSymbol,activeId:Number(targetId),size,to:now,requestId:rid,at:Date.now()};pruneMarketRequests(st);st.marketRequests.set(rid,{activeId:Number(targetId),size,at:Date.now(),direction:'sentinel-request',command:'get-candles'});
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
        st.lastCandleRequest={transport:'legacy-fallback',symbol:targetSymbol,activeId:Number(targetId),size,to:now,requestId:legacyRid,at:Date.now()};pruneMarketRequests(st);st.marketRequests.set(legacyRid,{activeId:Number(targetId),size,at:Date.now(),direction:'sentinel-request',command:'candles'});
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
      const saved={symbol:st.symbol,activeId:st.activeId,candles:[...st.candles],quote:st.quote,quoteHistory:[...(st.quoteHistory||[])],lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,candleActiveId:st.candleActiveId,candleIntegrity:st.candleIntegrity,subscribedSymbol:st.subscribedSymbol,subscribedActiveId:st.subscribedActiveId};
      st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'probe'};st.subscribedSymbol=null;st.subscribedActiveId=null;
      await this._requestCandles(provider,{symbol:candidate,activeId:id,force:true}).catch(()=>{});
      await sleep(220);
      const viable=candleFreshForState(st)&&st.candles.length>=50;
      st.symbol=saved.symbol;st.activeId=saved.activeId;st.candles=saved.candles;st.quote=saved.quote;st.quoteHistory=saved.quoteHistory;st.lastQuoteAt=saved.lastQuoteAt;st.lastCandleAt=saved.lastCandleAt;st.candleActiveId=saved.candleActiveId;st.candleIntegrity=saved.candleIntegrity;st.subscribedSymbol=saved.subscribedSymbol;st.subscribedActiveId=saved.subscribedActiveId;
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
      st.symbol=screenSymbol;st.activeId=null;st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'asset_switch'};st.subscribedSymbol=null;st.subscribedActiveId=null;st.autoSelected=false;st.suggestedSymbol=null;
    }
    let targetId=st.activeMap.get(pairKey(screenSymbol));
    if(targetId==null){await this.requestBaseData(provider).catch(()=>{});await sleep(120);targetId=st.activeMap.get(pairKey(screenSymbol))}
    if(targetId==null){st.activeId=null;st.marketStatus='syncing';st.marketReason=`Identificando o ativo da tela ${screenSymbol}`;return false}
    st.activeId=Number(targetId);
    await this._requestCandles(provider,{symbol:screenSymbol,activeId:Number(targetId),force});
    if(candleFreshForState(st)&&st.candles.length>=50){
      st.marketStatus='open';st.marketReason=`Ativo da tela ${screenSymbol} com candles atuais`;st.suggestedSymbol=null;return true;
    }
    const age=latestCandleAgeMs(st);
    st.marketStatus='stale';st.marketReason=age==null?`Aguardando candles do ativo da tela ${screenSymbol}`:`Última candle de ${screenSymbol} há ${Math.round(age/60000)} min`;
    if(st.mode==='demo')await this.recoverMarket(provider);
    return candleFreshForState(st)&&st.candles.length>=50;
  }
  async _axExecutionUi(provider){
    const sess=await this.session(provider);if(!sess.page||!sess.context?.newCDPSession)return null;
    let cdp=null;
    try{
      cdp=await sess.context.newCDPSession(sess.page);
      await cdp.send('Accessibility.enable').catch(()=>{});
      const tree=await cdp.send('Accessibility.getFullAXTree');
      const nodes=Array.isArray(tree?.nodes)?tree.nodes:[],map=new Map(nodes.map(n=>[n.nodeId,n]));
      const v=x=>String(x?.value??'').trim();
      const role=n=>v(n?.role).toLowerCase();
      const own=n=>[v(n?.name),v(n?.description),v(n?.value),role(n)].filter(Boolean).join(' ');
      const context=n=>{
        let out=own(n),p=n?.parentId;
        for(let i=0;i<3&&p;i++){const x=map.get(p);if(!x)break;out+=' '+own(x);p=x.parentId}
        return out.toLowerCase()
      };
      const sentinelAx=/sentinel\s*v13|painel premium|cen[aá]rio futuro por prazo|m[eé]dia dos 3 totais|piloto autom[aá]tico/i;
      const usable=nodes.filter(n=>!n.ignored&&n.backendDOMNodeId&&!sentinelAx.test(context(n)));
      const score=(n,kind)=>{
        const d=context(n),r=role(n);let sc=0;
        const rx=kind==='buy'?/\b(acima|higher|buy|comprar|compra|call|up)\b/i:/\b(abaixo|lower|sell|vender|venda|put|down)\b/i;
        if(rx.test(d))sc+=12;
        if(/button/.test(r))sc+=5;
        if(/generic|group/.test(r))sc+=1;
        return sc
      };
      const pick=kind=>usable.map(n=>({n,sc:score(n,kind)})).filter(x=>x.sc>=12).sort((a,b)=>b.sc-a.sc)[0]?.n||null;
      let buy=pick('buy'),sell=pick('sell');
      if(buy?.backendDOMNodeId&&sell?.backendDOMNodeId&&Number(buy.backendDOMNodeId)===Number(sell.backendDOMNodeId)){buy=null;sell=null}
      const amountRx=/\binvest\b|investment|investimento|amount|valor|stake|aposta/i;
      const amount=usable.map(n=>{
        const d=context(n),r=role(n);let sc=0;
        if(amountRx.test(d))sc+=12;
        if(/spinbutton|textbox|combobox/.test(r))sc+=7;
        if(/editable|input/.test(d))sc+=2;
        return{n,sc,d,r}
      }).filter(x=>x.sc>=14).sort((a,b)=>b.sc-a.sc)[0]||null;
      const buttons=usable.filter(n=>/button/.test(role(n))).length;
      return{
        buy:!!buy,sell:!!sell,amount:!!amount,
        buyText:buy?context(buy).slice(0,180):'',
        sellText:sell?context(sell).slice(0,180):'',
        amountText:amount?amount.d.slice(0,180):'',
        buttonCount:buttons,amountCandidateCount:amount?1:0,
        ax:{buyBackendId:buy?.backendDOMNodeId||null,sellBackendId:sell?.backendDOMNodeId||null,amountBackendId:amount?.n?.backendDOMNodeId||null}
      }
    }catch{return null}
    finally{try{await cdp?.detach()}catch{}}
  }
  async _axClickBackend(cdp,page,backendNodeId){
    if(!backendNodeId)return false;
    try{
      const model=await cdp.send('DOM.getBoxModel',{backendNodeId:Number(backendNodeId)});
      const q=model?.model?.border||model?.model?.content;
      if(!Array.isArray(q)||q.length<8)return false;
      const xs=[q[0],q[2],q[4],q[6]].map(Number),ys=[q[1],q[3],q[5],q[7]].map(Number);
      const x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
      await page.mouse.click(x,y);return true
    }catch{return false}
  }
  async _axDemoOrder(provider,{amount,side}={}){
    const sess=await this.session(provider);if(!sess.page||!sess.context?.newCDPSession)return null;
    const ax=await this._axExecutionUi(provider);if(!ax?.buy||!ax?.sell||!ax?.amount)return null;
    let cdp=null;
    try{
      cdp=await sess.context.newCDPSession(sess.page);
      const amountOk=await this._axClickBackend(cdp,sess.page,ax.ax?.amountBackendId);
      if(!amountOk)return{ok:false,error:'ax_amount_click_failed'};
      await sess.page.keyboard.press('Control+A').catch(()=>{});
      await sess.page.keyboard.type(String(amount),{delay:15}).catch(()=>{});
      await sess.page.keyboard.press('Enter').catch(()=>{});
      await sleep(120);
      const targetId=String(side).toUpperCase()==='BUY'?ax.ax?.buyBackendId:ax.ax?.sellBackendId;
      const buttonOk=await this._axClickBackend(cdp,sess.page,targetId);
      if(!buttonOk)return{ok:false,error:'ax_trade_button_click_failed'};
      return{ok:true,button:String(side).toUpperCase()==='BUY'?ax.buyText:ax.sellText,amountControl:ax.amountText,source:'accessibility-tree'}
    }catch(e){return{ok:false,error:'ax_execution_failed',detail:String(e?.message||e)}}
    finally{try{await cdp?.detach()}catch{}}
  }
  async _locatorDemoOrder(provider,{amount,side}={}){
    const sess=await this.session(provider);if(!sess.page)return null;
    const wanted=String(side).toUpperCase();
    const isSentinel=async loc=>{try{return await loc.evaluate(el=>{let root=el?.getRootNode?.();for(let i=0;i<4&&root?.host;i++,root=root.host.getRootNode?.()){if(root.host?.id==='sentinel-trading-overlay-host')return true}return false})}catch{return false}};
    const firstBrokerVisible=async loc=>{
      try{
        const count=Math.min(await loc.count(),120);
        for(let i=0;i<count;i++){const x=loc.nth(i);if(!(await x.isVisible({timeout:100}).catch(()=>false)))continue;if(await isSentinel(x))continue;return x}
      }catch{}
      return null
    };
    const textOf=async loc=>{try{return String(await loc.innerText({timeout:120})||'').trim()}catch{return''}};
    const parseNum=raw=>{const m=String(raw||'').replace(/\s/g,'').match(/\d+(?:[.,]\d+)?/);if(!m)return null;const v=Number(m[0].replace(',','.'));return Number.isFinite(v)?v:null};
    for(const frame of sess.page.frames()){
      try{
        const target=await firstBrokerVisible(frame.getByText(wanted==='BUY'?/^\s*(ACIMA|HIGHER|BUY|COMPRAR|COMPRA)\s*$/i:/^\s*(ABAIXO|LOWER|SELL|VENDER|VENDA)\s*$/i));
        if(!target)continue;
        let input=null,plus=null,minus=null,valueBox=null,panelText='';
        const labels=frame.getByText(/^\s*(Invest|Investment|Investimento|Amount|Valor|Stake|Aposta)\s*:?\s*$/i);
        const lc=Math.min(await labels.count().catch(()=>0),30);
        for(let i=0;i<lc&&!input&&!(plus&&minus);i++){
          const label=labels.nth(i);if(!(await label.isVisible({timeout:80}).catch(()=>false))||await isSentinel(label))continue;
          for(let up=1;up<=6&&!input&&!(plus&&minus);up++){
            const box=label.locator('xpath='+'/..'.repeat(up));
            const ins=box.locator('input,[role="spinbutton"],[contenteditable="true"]');
            input=await firstBrokerVisible(ins);
            const buttons=box.locator('button,[role="button"]');
            const bc=Math.min(await buttons.count().catch(()=>0),30);
            for(let j=0;j<bc&&!(plus&&minus);j++){
              const bt=buttons.nth(j);if(!(await bt.isVisible({timeout:60}).catch(()=>false))||await isSentinel(bt))continue;
              const d=((await textOf(bt))+' '+String(await bt.getAttribute('aria-label').catch(()=>null)||'')+' '+String(await bt.getAttribute('title').catch(()=>null)||'')).toLowerCase();
              if(!plus&&(/increase|increment|plus|aumentar/.test(d)||/^\s*\+\s*$/.test(d)))plus=bt;
              if(!minus&&(/decrease|decrement|minus|diminuir/.test(d)||/^\s*[−-]\s*$/.test(d)))minus=bt
            }
            panelText=await textOf(box);valueBox=box
          }
        }
        if(input){
          try{await input.click({timeout:500});await input.fill(String(amount),{timeout:600})}
          catch{try{await input.click({timeout:500});await sess.page.keyboard.press('Control+A');await sess.page.keyboard.type(String(amount),{delay:12});await sess.page.keyboard.press('Enter')}catch{continue}}
        }else if(plus&&minus&&valueBox){
          let current=parseNum(panelText||await textOf(valueBox));if(current==null)continue;
          let guard=0;
          while(Math.abs(current-Number(amount))>.001&&guard++<60){
            await (current<Number(amount)?plus:minus).click({timeout:500});
            await sleep(35);
            const next=parseNum(await textOf(valueBox));if(next==null||Math.abs(next-current)<.0001)break;current=next
          }
          if(Math.abs(current-Number(amount))>.001)continue
        }else continue;
        await target.click({timeout:800});
        return{ok:true,button:(await textOf(target)).slice(0,180),amountControl:input?'locator-input':'locator-stepper',source:'playwright-locator'}
      }catch{}
    }
    return null
  }
  async scanExecutionUi(provider){
    const s=await this.session(provider),st=this.state(provider);if(!s.page)return false;
    try{
      let ui=null,uiScore=-1;
      for(const frame of s.page.frames()){
        try{
          const candidate=await frame.evaluate(()=>{
        const visible=(el)=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>8&&r.height>8};
        const desc=(el)=>[el.textContent,el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.getAttribute?.('data-test'),el.getAttribute?.('data-testid'),el.getAttribute?.('name'),el.getAttribute?.('id'),el.className].filter(Boolean).join(' ').toLowerCase();
        const sentinelNode=el=>!!el?.closest?.('#sentinel-trading-overlay-host')||/sentinel\s*v13|painel premium|cen[aá]rio futuro por prazo/i.test(desc(el));
        const base=[...document.querySelectorAll('button,[role=button],[data-test],[data-testid],[class*="button" i],[class*="deal" i],[class*="trade" i]')].filter(el=>!sentinelNode(el));
        const labelled=[...document.querySelectorAll('div,span,a')].filter(visible).filter(el=>!sentinelNode(el)).filter(el=>/^(acima|abaixo|higher|lower|buy|sell|comprar|vender|up|down|\+|−)$/i.test(String(el.textContent||'').trim())).map(el=>el.closest?.('button,[role=button],[data-test],[data-testid],[class*="button" i],[class*="deal" i]')||el);
        const all=[...new Set([...base,...labelled])].filter(visible).filter(el=>!sentinelNode(el));
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
        const amountEls=[...document.querySelectorAll('input,[role=spinbutton],[contenteditable=true],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[data-testid*="investment" i],[class*="investment" i],[class*="invest" i]')].filter(visible).filter(el=>!sentinelNode(el));
        let amount=amountEls.find(el=>/\binvest\b|amount|investment|investimento|valor|stake|deal[-_ ]?amount|money/i.test(desc(el)))||amountEls.find(el=>el.tagName==='INPUT'||el.getAttribute?.('role')==='spinbutton')||null;
        let stepButtons=all.filter(el=>/increase|decrease|increment|decrement|plus|minus|aumentar|diminuir|amount|investment|investimento|\binvest\b|valor/i.test(desc(el)));
        let plus=stepButtons.find(el=>/increase|increment|plus|aumentar|(?:^|\s)\+(?:\s|$)/.test(desc(el)))||null;
        let minus=stepButtons.find(el=>/decrease|decrement|minus|diminuir|(?:^|\s)[−-](?:\s|$)/.test(desc(el)))||null;
        // IQ Option 2026 labels the stake panel "Invest". Its +/- controls may have no amount class.
        if(!amount||!(plus&&minus)){
          const labels=[...document.querySelectorAll('label,div,span,p')].filter(visible).filter(el=>!sentinelNode(el)).filter(el=>/^\s*(invest|investment|investimento|amount|valor|stake|aposta)\s*:?\s*$/i.test(String(el.textContent||'')));
          outer:for(const label of labels){
            let box=label;
            for(let up=0;up<5&&box;up++,box=box.parentElement){
              if(!amount){
                const inputs=[...box.querySelectorAll('input,[role=spinbutton],[contenteditable=true]')].filter(visible);
                amount=inputs[0]||null
              }
              const buttons=[...box.querySelectorAll('button,[role=button],[data-test],[data-testid]')].filter(visible).filter(el=>!sentinelNode(el));
              const p=buttons.find(el=>/increase|increment|plus|aumentar|^\s*\+\s*$/.test(desc(el)))||null;
              const m=buttons.find(el=>/decrease|decrement|minus|diminuir|^\s*[−-]\s*$/.test(desc(el)))||null;
              if(p&&m){plus=plus||p;minus=minus||m}
              if(amount||(plus&&minus))break outer
            }
          }
        }
        const expiryEls=[...document.querySelectorAll('input,button,[role=button],[role=spinbutton],[data-test],[data-testid],[class*="expir" i],[class*="duration" i],[class*="time" i]')].filter(visible);
        const expiryHint=el=>{let out='',node=el;for(let i=0;i<3&&node;i++,node=node.parentElement)out+=' '+desc(node);return out.slice(0,900)};
        const rawValue=el=>String(el?.value??el?.getAttribute?.('aria-valuenow')??el?.getAttribute?.('data-value')??el?.textContent??'').trim();
        const parseClock=(h,m,s=0)=>{const now=new Date(),target=new Date(now);target.setHours(h,m,s,0);if(target.getTime()<=now.getTime()-1500)target.setDate(target.getDate()+1);const delta=target.getTime()-now.getTime();return delta>=10000&&delta<=3600000?delta:null};
        const parseExpiry=(raw,hint='')=>{
          const t=String(raw||'').trim().toLowerCase().replace(/\s+/g,' ');if(!t)return null;
          const strongDuration=/duration|duraç|duracao|prazo|tempo de opera|trade time/.test(hint);
          const strongExpiry=/expiration|expiry|expiraç|expiracao|expira|vencimento/.test(hint);
          let total=0,unit=false,m;
          const hr=t.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)\b/);if(hr){total+=Number(hr[1].replace(',','.'))*3600000;unit=true}
          const mn=t.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minuto|minutos)\b/);if(mn){total+=Number(mn[1].replace(',','.'))*60000;unit=true}
          const sc=t.match(/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segs|segundo|segundos)\b/);if(sc){total+=Number(sc[1].replace(',','.'))*1000;unit=true}
          if(unit&&total>=10000&&total<=3600000)return{ms:Math.round(total),kind:'duration'};
          m=t.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
          if(m){
            const a=Number(m[1]),b=Number(m[2]),cc=m[3]==null?null:Number(m[3]);
            if(cc!=null){
              if((strongExpiry&&!strongDuration&&a>=3)||a>2){const ms=parseClock(a,b,cc);if(ms!=null)return{ms,kind:'clock'}}
              const ms=((a*60+b)*60+cc)*1000;if(ms>=10000&&ms<=3600000)return{ms,kind:'duration'}
            }else{
              const nowH=new Date().getHours();
              if(strongExpiry&&!strongDuration&&(a===nowH||a===((nowH+1)%24)||a>15)){const ms=parseClock(a,b,0);if(ms!=null)return{ms,kind:'clock'}}
              const ms=(a*60+b)*1000;if(ms>=10000&&ms<=3600000)return{ms,kind:'duration'}
            }
          }
          m=t.match(/^\s*(\d{1,4})\s*$/);if(m&&strongDuration){const v=Number(m[1]);const ms=v<=30?v*1000:v<=60?v*1000:v*60000;if(ms>=10000&&ms<=3600000)return{ms,kind:'duration'}}
          return null
        };
        const expiryCandidates=expiryEls.map(el=>{
          const hint=expiryHint(el),raw=rawValue(el);
          if(!/expiration|expiry|expiraç|expiracao|expira|vencimento|duration|duraç|duracao|prazo|tempo de opera|trade time/.test(hint))return null;
          if(/chart|candle|interval|timeframe|gráfico|grafico/.test(hint)&&!/expiration|expiry|expiraç|expiracao|vencimento/.test(hint))return null;
          const parsed=parseExpiry(raw,hint);if(!parsed)return null;
          let score=0;if(/expiration|expiry|expiraç|expiracao|vencimento/.test(hint))score+=40;if(/duration|duraç|duracao|prazo|tempo de opera|trade time/.test(hint))score+=32;
          if(/data-test|data-testid/.test(hint))score+=5;if(el.tagName==='INPUT'||el.getAttribute?.('role')==='spinbutton')score+=4;
          return{ms:parsed.ms,kind:parsed.kind,raw:raw.slice(0,80),hint:hint.slice(0,180),score}
        }).filter(Boolean).sort((a,b)=>b.score-a.score);
        const expiry=expiryCandidates[0]||null;
        return{
          buy:!!buy,sell:!!sell,amount:!!amount||!!(plus&&minus),amountStepper:!!(plus&&minus),
          expirationDurationMs:expiry?.ms??null,expirationRaw:expiry?.raw||'',expirationKind:expiry?.kind||null,expirationConfidence:expiry?.score||0,
          buyText:buy?desc(buy).slice(0,180):'',
          sellText:sell?desc(sell).slice(0,180):'',
          amountText:amount?desc(amount).slice(0,180):((plus&&minus)?'stepper +/-':''),
          buttonCount:all.length,amountCandidateCount:amountEls.length
        };
          });
          const score=(candidate.buy?5:0)+(candidate.sell?5:0)+(candidate.amount?4:0)+(candidate.expirationDurationMs?2:0)+Math.min(3,Number(candidate.buttonCount||0)/10);
          if(score>uiScore){ui={...candidate,frameUrl:frame.url(),frameName:frame.name()};uiScore=score}
        }catch{}
      }
      ui=ui||{buy:false,sell:false,amount:false,amountStepper:false,buttonCount:0,amountCandidateCount:0};

      // IQ Option can render the trading controls inside open shadow roots. page.evaluate/querySelector
      // does not pierce those roots, while Playwright locators do. Use this as a read-only fallback.
      if(!ui.buy||!ui.sell||!ui.amount||!ui.expirationDurationMs){
        const textOf=async loc=>{
          try{
            const txt=String(await loc.innerText({timeout:120})||'').trim();
            const aria=String(await loc.getAttribute('aria-label')||'').trim();
            const title=String(await loc.getAttribute('title')||'').trim();
            return [txt,aria,title].filter(Boolean).join(' ')
          }catch{return''}
        };
        const firstVisible=async loc=>{
          try{
            const count=Math.min(await loc.count(),120);
            for(let i=0;i<count;i++){const x=loc.nth(i);if(await x.isVisible({timeout:80}).catch(()=>false))return x}
          }catch{}
          return null
        };
        const parseDurationText=raw=>{
          const t=String(raw||'').toLowerCase().replace(/\s+/g,' ');
          let m=t.match(/(\d+(?:[.,]\d+)?)\s*(?:min|mins|minuto|minutos)\b/);
          if(m){const ms=Math.round(Number(m[1].replace(',','.'))*60000);if(ms>=10000&&ms<=3600000)return ms}
          m=t.match(/(\d+(?:[.,]\d+)?)\s*(?:s|seg|segs|segundo|segundos)\b/);
          if(m){const ms=Math.round(Number(m[1].replace(',','.'))*1000);if(ms>=10000&&ms<=3600000)return ms}
          m=t.match(/\b(\d{1,2}):(\d{2})\b/);
          if(m){const ms=(Number(m[1])*60+Number(m[2]))*1000;if(ms>=10000&&ms<=3600000)return ms}
          return null
        };
        for(const frame of s.page.frames()){
          try{
            if(!ui.buy){
              const x=await firstVisible(frame.getByText(/^\s*(ACIMA|HIGHER|BUY|COMPRAR|COMPRA)\s*$/i));
              if(x){ui.buy=true;ui.buyText=(await textOf(x)).slice(0,180);ui.buttonCount=Math.max(1,Number(ui.buttonCount||0))}
            }
            if(!ui.sell){
              const x=await firstVisible(frame.getByText(/^\s*(ABAIXO|LOWER|SELL|VENDER|VENDA)\s*$/i));
              if(x){ui.sell=true;ui.sellText=(await textOf(x)).slice(0,180);ui.buttonCount=Math.max(2,Number(ui.buttonCount||0))}
            }
            if(!ui.amount){
              const inputs=frame.locator('input,[role="spinbutton"],[contenteditable="true"],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[data-testid*="investment" i],[class*="investment" i]');
              const count=Math.min(await inputs.count().catch(()=>0),80);
              for(let i=0;i<count;i++){
                const x=inputs.nth(i);if(!(await x.isVisible({timeout:80}).catch(()=>false)))continue;
                const d=(await textOf(x))+' '+String(await x.getAttribute('placeholder').catch(()=>null)||'')+' '+String(await x.getAttribute('name').catch(()=>null)||'');
                if(/\binvest\b|amount|investment|investimento|valor|stake/i.test(d)){ui.amount=true;ui.amountText=d.slice(0,180);ui.amountCandidateCount=Math.max(1,Number(ui.amountCandidateCount||0));break}
              }
              if(!ui.amount){
                const labels=frame.getByText(/^\s*(Invest|Investment|Investimento|Amount|Valor|Stake|Aposta)\s*:?\s*$/i);
                const lc=Math.min(await labels.count().catch(()=>0),20);
                for(let i=0;i<lc&&!ui.amount;i++){
                  const label=labels.nth(i);if(!(await label.isVisible({timeout:80}).catch(()=>false)))continue;
                  for(let up=1;up<=5&&!ui.amount;up++){
                    const box=label.locator('xpath='+'/..'.repeat(up));
                    const input=await firstVisible(box.locator('input,[role="spinbutton"],[contenteditable="true"]'));
                    if(input){ui.amount=true;ui.amountText=((await textOf(label))+' '+(await textOf(input))).slice(0,180);ui.amountCandidateCount=Math.max(1,Number(ui.amountCandidateCount||0))}
                  }
                }
              }
            }
            if(!ui.expirationDurationMs){
              const labels=frame.getByText(/expiraç|expiracao|expiration|expiry|vencimento/i);
              const count=Math.min(await labels.count().catch(()=>0),30);
              for(let i=0;i<count;i++){
                const x=labels.nth(i);if(!(await x.isVisible({timeout:80}).catch(()=>false)))continue;
                let raw=await textOf(x);
                for(let up=0;up<3&&!parseDurationText(raw);up++){
                  const p=x.locator('xpath=..'+('/..'.repeat(up)));
                  raw+=' '+await textOf(p)
                }
                const ms=parseDurationText(raw);
                if(ms){ui.expirationDurationMs=ms;ui.expirationRaw=raw.slice(0,180);ui.expirationKind='duration';ui.expirationConfidence=Math.max(80,Number(ui.expirationConfidence||0));break}
              }
            }
            if((ui.buy&&ui.sell&&ui.expirationDurationMs)&&ui.amount)break
          }catch{}
        }
      }

      if(!ui.buy||!ui.sell||!ui.amount){
        const ax=await this._axExecutionUi(provider).catch(()=>null);
        if(ax){
          ui={...ui,
            buy:ui.buy||ax.buy,sell:ui.sell||ax.sell,amount:ui.amount||ax.amount,
            buyText:ui.buyText||ax.buyText,sellText:ui.sellText||ax.sellText,amountText:ui.amountText||ax.amountText,
            buttonCount:Math.max(Number(ui.buttonCount||0),Number(ax.buttonCount||0)),
            amountCandidateCount:Math.max(Number(ui.amountCandidateCount||0),Number(ax.amountCandidateCount||0)),
            ax:ax.ax||ui.ax||null
          }
        }
      }

      const assetMatch=!!(st.uiSymbol&&st.symbol&&pairKey(st.uiSymbol)===pairKey(st.symbol));
      if(Number.isFinite(Number(ui.expirationDurationMs))&&Number(ui.expirationDurationMs)>=10000){
        st.expirationDurationMs=Number(ui.expirationDurationMs);st.expirationRaw=String(ui.expirationRaw||'');st.expirationKind=ui.expirationKind||null;st.expirationConfidence=Number(ui.expirationConfidence||0);st.expirationUpdatedAt=Date.now();
      }else if(st.expirationUpdatedAt&&Date.now()-Number(st.expirationUpdatedAt)>15000){
        st.expirationDurationMs=null;st.expirationRaw=null;st.expirationKind=null;st.expirationConfidence=0;
      }
      st.executionUi={...ui,assetMatch,uiSymbol:st.uiSymbol,marketSymbol:st.symbol,expirationDurationMs:st.expirationDurationMs,expirationRaw:st.expirationRaw,expirationKind:st.expirationKind,expirationConfidence:st.expirationConfidence};
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
    let result=null,bestScore=-1;
    for(const frame of s.page.frames()){
      try{
        const candidate=await frame.evaluate(({amount,side})=>{
      const visible=(el)=>{const cs=getComputedStyle(el),r=el.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&Number(cs.opacity||1)>0&&r.width>8&&r.height>8};
      const desc=(el)=>[el.textContent,el.getAttribute?.('aria-label'),el.getAttribute?.('title'),el.getAttribute?.('data-test'),el.getAttribute?.('data-testid'),el.getAttribute?.('name'),el.getAttribute?.('id'),el.className].filter(Boolean).join(' ').toLowerCase();
      const sentinelNode=el=>!!el?.closest?.('#sentinel-trading-overlay-host')||/sentinel\s*v13|painel premium|cen[aá]rio futuro por prazo/i.test(desc(el));
      const base=[...document.querySelectorAll('button,[role=button],[data-test],[data-testid],[class*="button" i],[class*="deal" i],[class*="trade" i]')].filter(el=>!sentinelNode(el));
      const labelled=[...document.querySelectorAll('div,span,a')].filter(visible).filter(el=>!sentinelNode(el)).filter(el=>/^(acima|abaixo|higher|lower|buy|sell|comprar|vender|up|down|\+|−)$/i.test(String(el.textContent||'').trim())).map(el=>el.closest?.('button,[role=button],[data-test],[data-testid],[class*="button" i],[class*="deal" i]')||el);
      const all=[...new Set([...base,...labelled])].filter(visible).filter(el=>!sentinelNode(el));
      const rx=side==='BUY'?/(deal[-_ ]?button[-_ ]?up|button[-_ ]?up|call|higher|comprar|compra|buy|acima|up)/i:/(deal[-_ ]?button[-_ ]?down|button[-_ ]?down|put|lower|vender|venda|sell|abaixo|down)/i;
      const target=all.map(el=>({el,d:desc(el)})).filter(x=>rx.test(x.d)).sort((a,b)=>((b.el.tagName==='BUTTON'?3:0)+(b.el.getAttribute?.('role')==='button'?2:0))-((a.el.tagName==='BUTTON'?3:0)+(a.el.getAttribute?.('role')==='button'?2:0)))[0]?.el||null;
      const amountEls=[...document.querySelectorAll('input,[role=spinbutton],[contenteditable=true],[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[data-testid*="investment" i],[class*="investment" i],[class*="invest" i]')].filter(visible).filter(el=>!sentinelNode(el));
      let input=amountEls.find(el=>/\binvest\b|amount|investment|investimento|valor|stake|deal[-_ ]?amount|money/i.test(desc(el)))||amountEls.find(el=>el.tagName==='INPUT'||el.getAttribute?.('role')==='spinbutton')||null;
      if(input&&input.tagName!=='INPUT'&&input.querySelector)input=input.querySelector('input,[role=spinbutton],[contenteditable=true]')||input;
      let stepButtons=all.filter(el=>/increase|decrease|increment|decrement|plus|minus|aumentar|diminuir|amount|investment|investimento|\binvest\b|valor/i.test(desc(el)));
      let plus=stepButtons.find(el=>/increase|increment|plus|aumentar|(?:^|\s)\+(?:\s|$)/.test(desc(el)))||null;
      let minus=stepButtons.find(el=>/decrease|decrement|minus|diminuir|(?:^|\s)[−-](?:\s|$)/.test(desc(el)))||null;
      if(!input||!(plus&&minus)){
        const labels=[...document.querySelectorAll('label,div,span,p')].filter(visible).filter(el=>!sentinelNode(el)).filter(el=>/^\s*(invest|investment|investimento|amount|valor|stake|aposta)\s*:?\s*$/i.test(String(el.textContent||'')));
        outer:for(const label of labels){
          let box=label;
          for(let up=0;up<5&&box;up++,box=box.parentElement){
            if(!input)input=[...box.querySelectorAll('input,[role=spinbutton],[contenteditable=true]')].filter(visible)[0]||null;
            const buttons=[...box.querySelectorAll('button,[role=button],[data-test],[data-testid]')].filter(visible).filter(el=>!sentinelNode(el));
            const p=buttons.find(el=>/increase|increment|plus|aumentar|^\s*\+\s*$/.test(desc(el)))||null,m=buttons.find(el=>/decrease|decrement|minus|diminuir|^\s*[−-]\s*$/.test(desc(el)))||null;
            if(p&&m){plus=plus||p;minus=minus||m}
            if(input||(plus&&minus))break outer
          }
        }
      }
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
          const candidates=[...document.querySelectorAll('[data-test*="amount" i],[data-testid*="amount" i],[class*="amount" i],[data-test*="investment" i],[data-testid*="investment" i],[class*="investment" i],[class*="invest" i],[role=spinbutton],div,span')].filter(visible).filter(el=>/amount|investment|investimento|valor|stake|invest|\$|r\$|usd/i.test(desc(el)));
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
        const score=(candidate?.target?5:0)+(candidate?.amount||candidate?.stepper?4:0)+(candidate?.ok?10:0);
        if(candidate?.ok){result={...candidate,frameUrl:frame.url(),frameName:frame.name()};break}
        if(score>bestScore){bestScore=score;result=candidate}
      }catch{}
    }
    if(!result?.ok){
      const locatorResult=await this._locatorDemoOrder(provider,{amount,side}).catch(()=>null);
      if(locatorResult?.ok)result=locatorResult;
    }
    if(!result?.ok){
      const axResult=await this._axDemoOrder(provider,{amount,side}).catch(()=>null);
      if(axResult?.ok)result=axResult;
    }
    if(!result?.ok)throw new Error(result?.error||'demo_order_click_failed');
    st.lastRequestAt=Date.now();
    return{id:`demo-${provider}-${Date.now()}`,provider,asset:st.symbol,side,amount,status:'submitted',openedAt:new Date().toISOString(),referencePrice:st.quote,external:true,button:result.button,amountControl:result.amountControl}
  }
  applyActiveSelection(provider,{symbol=null,activeId=null,source='ui'}={}){
    const st=this.state(provider),aid=Number(activeId);
    let next=symbol?assetStrings(symbol)[0]||null:null;
    if(!next&&Number.isFinite(aid)){
      const key=[...st.activeMap.entries()].find(([,id])=>Number(id)===aid)?.[0]||null;
      if(key){
        const named={GOLD:'Gold',SILVER:'Silver',BITCOIN:'Bitcoin',ETHEREUM:'Ethereum',CRUDEOIL:'Crude Oil',NATURALGAS:'Natural Gas'};
        next=[...st.assets].find(x=>pairKey(x)===key)||named[key]||((key.length===6||key.endsWith('OTC'))?(key.endsWith('OTC')?`${key.slice(0,3)}/${key.slice(3,6)} OTC`:`${key.slice(0,3)}/${key.slice(3,6)}`):null)
      }
    }
    if(!next)return false;
    const key=pairKey(next),current=pairKey(st.uiSymbol||st.symbol||''),changed=key!==current;
    if(changed&&source!=='click'&&!String(source).startsWith('protocol-page')&&current){
      if(st.pendingUiKey!==key){st.pendingUiKey=key;st.pendingUiHits=1;return false}
      st.pendingUiHits=Number(st.pendingUiHits||0)+1;
      if(st.pendingUiHits<2)return false;
    }
    st.pendingUiKey=null;st.pendingUiHits=0;
    if(!changed){
      st.uiSymbol=next;st.symbol=next;st.lastUiSignalAt=Date.now();st.uiSymbolSource=source;
      const mapped=st.activeMap.get(key);if(mapped!=null)st.activeId=Number(mapped);
      return true;
    }
    st.uiSymbol=next;st.symbol=next;st.activeId=st.activeMap.get(key)??(Number.isFinite(aid)?aid:null);st.pendingPageActiveId=null;
    st.lastUiSignalAt=Date.now();st.uiSymbolSource=source;st.autoSelected=false;
    st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'asset_switch'};
    st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;st.lastRequestAt=null;
    st.marketStatus='switching';st.marketReason=`Ativo alterado na corretora: ${next}`;
    try{Promise.resolve(this.marketUpdateHandler?.(provider,{symbol:next,uiSymbol:next,activeId:st.activeId,source,assetChanged:true})).catch(()=>{})}catch{}
    if(st.switchRequestTimer){clearTimeout(st.switchRequestTimer);st.switchRequestTimer=null}
    if(!String(source).startsWith('protocol-page')){
      st.switchRequestTimer=setTimeout(()=>{
        st.switchRequestTimer=null;
        if(st.activeId!=null&&st.candles.length<20)this.requestMarketData(provider,{force:true}).catch(()=>{})
      },220)
    }
    return true
  }
  async maintain(provider){
    const st=this.state(provider),now=Date.now();
    if(st.lastMaintainAt&&now-st.lastMaintainAt<2200)return this.liveStatus(provider);
    st.lastMaintainAt=now;
    const direct=this.feeds.get(provider);const directStatus=direct?.status?.();
    if(directStatus&&directStatus.messageAgeMs!=null&&directStatus.messageAgeMs>30000){
      await direct.close().catch(()=>{});this.feeds.delete(provider);st.directStatus=null;st.lastDirectError='websocket_stale_reconnecting';st.protocol='reconnecting';
    }
    if(!st.lastFullDomAt||now-st.lastFullDomAt>30000){
      st.lastFullDomAt=now;
      await this.domSnapshot(provider).catch(()=>{});
    }
    if(!st.lastRequestAt||now-st.lastRequestAt>9000||st.balance==null)await this.requestBaseData(provider).catch(()=>{});
    const integrity=candleSeriesIntegrity(st.candles,st.quote);st.candleIntegrity=integrity;
    if(st.candles.length&&(!integrity.ok||st.candleActiveId==null||st.activeId==null||Number(st.candleActiveId)!==Number(st.activeId))){
      st.lastIntegrityError={...integrity,reason:integrity.ok?'active_id_do_historico_divergente':integrity.reason,at:Date.now(),activeId:st.activeId,candleActiveId:st.candleActiveId,symbol:st.symbol};
      st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.rejectedMarketFrames=Number(st.rejectedMarketFrames||0)+1;
      st.marketStatus='recovering';st.marketReason='Feed isolado: descartando histórico incompatível com o ativo atual';st.lastCandleRequest=null;
    }
    const actualAge=latestCandleAgeMs(st);const stale=actualAge==null||actualAge>Math.max(90000,Number(st.candleSize||60)*2000);
    if(st.candles.length<50||stale||!st.lastCandleRequest||now-Number(st.lastCandleRequest||0)>9000)await this.requestMarketData(provider,{force:st.candles.length<50||stale}).catch(()=>{});
    if(candleFreshForState(st)){st.marketStatus='open';st.marketReason=`${st.symbol||'Ativo'} com candles atuais`}
    else if(st.marketStatus!=='recovering'&&st.marketStatus!=='closed'){st.marketStatus='stale';st.marketReason='Feed conectado, mas sem candle recente'}
    if(!st.lastExecutionScanAt||now-st.lastExecutionScanAt>15000){
      st.lastExecutionScanAt=now;
      await this.scanExecutionUi(provider).catch(()=>{});
    }
    return this.liveStatus(provider)
  }
  async domSnapshot(provider,{allowAttach=false,fast=false}={}){const s=await this.session(provider);if(!s.page){if(allowAttach)await this.attachAutomation(provider,{manual:true});else throw new Error('broker_browser_not_attached')}const page=s.page;await this.installBridge(page,provider).catch(()=>{});const st=this.state(provider);let text='',title='',url='';try{url=page.url();title=await page.title();if(!fast)text=(await page.locator('body').innerText({timeout:1800})).slice(0,70000)}catch{}
    let accountText='',instrumentText='',activeSymbol='',clickedSymbol='',clickedAt=0;
    if(fast){
      try{const hint=await page.evaluate(()=>({clickedSymbol:String(window.__sentinelClickedSymbol||''),clickedAt:Number(window.__sentinelClickedSymbolAt||0)}));clickedSymbol=hint.clickedSymbol||'';clickedAt=Number(hint.clickedAt||0)}catch{}
    }else try{const dom=await page.evaluate(()=>{const visible=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};const pair=(t)=>{const raw=String(t||'').toUpperCase();let m=raw.match(/\b([A-Z]{3})\s*[\/-]\s*([A-Z]{3})(?:\s*\(?OTC\)?)?/);if(m)return `${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`;m=raw.match(/\b([A-Z]{3})([A-Z]{3})(?:-?OTC|\s*\(?OTC\)?)?\b/);if(m)return `${m[1]}/${m[2]}${/OTC/.test(m[0])?' OTC':''}`;for(const [needle,label] of [['GOLD','Gold'],['SILVER','Silver'],['BITCOIN','Bitcoin'],['ETHEREUM','Ethereum'],['CRUDE OIL','Crude Oil'],['NATURAL GAS','Natural Gas']])if(raw.includes(needle))return label+(raw.includes('OTC')?' OTC':'');return''};const els=[...document.querySelectorAll('[aria-selected],[aria-checked],[aria-current],[data-state],[class*="active"],[class*="selected"],[class*="tab"],[data-test*="tab" i],[data-testid*="tab" i],[data-test*="account" i],[data-testid*="account" i],[data-test*="balance" i],[data-testid*="balance" i],[data-test*="asset" i],[data-testid*="asset" i],[data-test*="instrument" i],[data-testid*="instrument" i],[role="tab"]')].filter(visible);const acct=els.map(el=>String(el.textContent||'').trim()).filter(t=>/practice|prática|demo|real account|conta real|conta de prática|saldo real|practice balance/i.test(t)).slice(0,30);const assetEls=els.filter(el=>pair(el.textContent||''));const score=(el)=>{let n=0,node=el;for(let d=0;d<5&&node;d++,node=node.parentElement){const cls=String(node.className||'').toLowerCase(),state=String(node.getAttribute?.('data-state')||'').toLowerCase(),cur=String(node.getAttribute?.('aria-current')||'').toLowerCase();if(node.getAttribute?.('aria-selected')==='true')n+=120;if(node.getAttribute?.('aria-checked')==='true')n+=110;if(cur&&cur!=='false')n+=100;if(/active|selected|current|checked/.test(state))n+=90;if(/(^|[ _-])(active|selected|current)([ _-]|$)/.test(cls))n+=75;try{const cs=getComputedStyle(node);if(parseFloat(cs.borderBottomWidth||'0')>=2&&cs.borderBottomColor!=='rgba(0, 0, 0, 0)'&&cs.borderBottomColor!=='transparent')n+=18}catch{}}const r=el.getBoundingClientRect();if(r.top<180)n+=5;return n};const ranked=assetEls.map(el=>({p:pair(el.textContent||''),s:score(el)})).filter(x=>x.p).sort((a,b)=>b.s-a.s);const active=ranked[0]&&ranked[0].s>0?ranked[0].p:'';const inst=assetEls.map(el=>String(el.textContent||'').trim()).slice(0,30);return{accountText:acct.join(' | '),instrumentText:inst.join(' | '),activeSymbol:active,clickedSymbol:String(window.__sentinelClickedSymbol||''),clickedAt:Number(window.__sentinelClickedSymbolAt||0)}});accountText=dom.accountText||'';instrumentText=dom.instrumentText||'';activeSymbol=dom.activeSymbol||'';clickedSymbol=dom.clickedSymbol||'';clickedAt=Number(dom.clickedAt||0)}catch{}
    st.lastDomAt=Date.now();if(!fast){for(const a of assetStrings(text))st.assets.add(a);const mode=detectMode(accountText)||st.mode;if(mode)st.mode=mode;applyKnownBalance(st);const b=bestBalanceFromText(text,st.mode);if(b&&b.value!=null&&b.score>=10&&(!st.mode||!b.mode||b.mode===st.mode)){st.balance=b.value;st.balanceSource=`dom:${b.mode||st.mode||'unknown'}`}};
    const clickedFresh=clickedAt>0&&Date.now()-clickedAt<8000;const clickedPairs=clickedFresh&&clickedSymbol?assetStrings(clickedSymbol):[];const domActive=activeSymbol?assetStrings(activeSymbol):[];const instrumentPairs=assetStrings(instrumentText);
    let nextUi=null,uiSource=null;
    if(clickedPairs.length===1){nextUi=clickedPairs[0];uiSource='click'}
    else if(domActive.length===1){nextUi=domActive[0];uiSource='dom-active'}
    else if(instrumentPairs.length===1){nextUi=instrumentPairs[0];uiSource='dom-single'}
    else if(st.uiSymbol&&instrumentPairs.some(x=>pairKey(x)===pairKey(st.uiSymbol))){nextUi=st.uiSymbol;uiSource=st.uiSymbolSource||'preserved'}
    if(nextUi){
      const changed=pairKey(nextUi)!==pairKey(st.uiSymbol||'');
      if(changed){
        st.uiSymbol=nextUi;st.symbol=nextUi;st.activeId=st.activeMap.get(pairKey(nextUi))??null;st.lastUiSignalAt=Date.now();st.uiSymbolSource=uiSource;
        st.candles=[];st.quote=null;st.quoteHistory=[];st.lastQuoteAt=null;st.lastCandleAt=null;st.candleActiveId=null;st.candleIntegrity={ok:false,reason:'asset_switch'};st.subscribedSymbol=null;st.subscribedActiveId=null;st.suggestedSymbol=null;
        st.marketStatus='switching';st.marketReason=`Trocando leitura e análise para ${nextUi}`;st.lastRequestAt=null;st.autoSelected=false;
      }else{st.uiSymbol=nextUi;st.lastUiSignalAt=Date.now();st.uiSymbolSource=uiSource;if(!st.autoSelected||pairKey(st.uiSymbol)===pairKey(st.symbol)){st.symbol=st.uiSymbol;st.autoSelected=false}}
    }else if(!st.uiSymbol&&!fast){const p=assetStrings(text);if(p.length===1){st.uiSymbol=p[0];st.symbol=p[0];st.lastUiSignalAt=Date.now();st.uiSymbolSource='body-single'}}
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
    const st=this.state(provider);const assets=uniq([st.symbol,st.uiSymbol,...st.assets]);const last=st.candles.at(-1)||null;const latestCandleTs=epochMs(last?.to??last?.from);const candleAgeMs=latestCandleTs==null?null:Math.max(0,Date.now()-latestCandleTs);const candleFresh=candleFreshForState(st);const integrity=candleSeriesIntegrity(st.candles,st.quote);st.candleIntegrity=integrity;
    const candleAssetMatch=st.activeId!=null&&st.candleActiveId!=null&&Number(st.activeId)===Number(st.candleActiveId);
    const feedValidated=!!(st.balance!=null&&['demo','real'].includes(st.mode)&&st.symbol&&st.activeId!=null&&st.quote!=null&&st.candles.length>=50&&candleFresh&&integrity.ok&&candleAssetMatch);
    const marketStatus=feedValidated?'open':(st.marketStatus||'stale');const marketReason=feedValidated?`${st.symbol||'Ativo'} atualizado e isolado por active_id`:(st.marketReason||(!integrity.ok?'Histórico rejeitado por integridade':'Sem candle recente'));
    return{balance:st.balance,balanceSource:st.balanceSource,assets:assets.slice(0,500),activeId:st.activeId,candleActiveId:st.candleActiveId,candleAssetMatch,quote:st.quote,symbol:st.symbol,uiSymbol:st.uiSymbol,candles:st.candles.slice(-400),quoteHistory:(st.quoteHistory||[]).slice(-900),mode:st.mode,quoteTs:st.lastQuoteAt||st.lastCandleAt||st.lastFrameAt||st.lastDomAt,lastFrameAt:st.lastFrameAt,lastDomAt:st.lastDomAt,lastQuoteAt:st.lastQuoteAt,lastCandleAt:st.lastCandleAt,latestCandleTs,candleAgeMs,candleFresh,candleIntegrity:integrity,rejectedMarketFrames:Number(st.rejectedMarketFrames||0),lastIntegrityError:st.lastIntegrityError||null,marketStatus,marketReason,autoSelected:!!st.autoSelected,lastRequestAt:st.lastRequestAt,protocol:st.protocol,directStatus:st.directStatus,lastDirectError:st.lastDirectError,lastCandleRequest:st.lastCandleRequest,lastCandleResponse:st.lastCandleResponse,suggestedSymbol:st.suggestedSymbol,feedValidated,executionReady:st.executionReady,executionUi:st.executionUi,expirationDurationMs:st.expirationDurationMs,expirationRaw:st.expirationRaw,expirationKind:st.expirationKind,expirationConfidence:st.expirationConfidence,expirationUpdatedAt:st.expirationUpdatedAt}
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
        if(host&&host.dataset.uiVersion!=='13.1'){host.remove();host=null;el=null}
        if(!el){
          host=document.createElement('div');host.id=hostId;host.dataset.uiVersion='13.1';
          Object.assign(host.style,{all:'initial',position:'static',zIndex:'2147483647'});
          const shadow=host.attachShadow({mode:'open'});
          const reset=document.createElement('style');
          reset.textContent=`:host{all:initial}*,*::before,*::after{box-sizing:border-box}button,select,input{font:inherit;text-transform:none;letter-spacing:normal}button{margin:0}@keyframes sentinelMetalSweep{0%,18%{transform:translateX(145%) skewX(-18deg);opacity:0}28%{opacity:.08}44%{opacity:.34}60%{opacity:.08}70%,100%{transform:translateX(-145%) skewX(-18deg);opacity:0}}#sentinel-trading-overlay{font-variant-numeric:tabular-nums;overflow-anchor:none;contain:layout paint;outline:none}[data-sentinel-card],[data-sentinel-role="horizon-outlook"]{contain:layout paint;overflow-anchor:none}.sentinel-shine{position:relative;isolation:isolate}.sentinel-shine::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;border-radius:inherit;clip-path:inset(0 round 13px);background:linear-gradient(100deg,transparent 35%,rgba(255,238,182,.02) 43%,rgba(255,224,128,.22) 49%,rgba(255,250,220,.34) 51%,rgba(255,209,92,.16) 55%,transparent 64%);transform:translateX(145%) skewX(-18deg);animation:sentinelMetalSweep 8.5s ease-in-out infinite}.sentinel-shine>*{position:relative;z-index:1}.sentinel-metal-gold{background:linear-gradient(180deg,#fff3c4 0%,#f4d77e 32%,#c99e3e 62%,#ffe8a1 100%);-webkit-background-clip:text;background-clip:text;color:transparent!important;-webkit-text-fill-color:transparent;text-shadow:0 0 12px rgba(242,205,111,.18)}#sentinel-trading-overlay::-webkit-scrollbar{width:7px;height:7px}#sentinel-trading-overlay::-webkit-scrollbar-track{background:transparent}#sentinel-trading-overlay::-webkit-scrollbar-thumb{background:rgba(154,132,88,.55);border-radius:999px}#sentinel-trading-overlay::-webkit-scrollbar-thumb:hover{background:rgba(190,160,96,.72)}`;
          shadow.appendChild(reset);
          el=document.createElement('section');el.id=id;el.dataset.uiVersion='13.1';shadow.appendChild(el);
          Object.assign(el.style,{
            position:'fixed',right:'12px',top:'12px',zIndex:'2147483647',
            width:'540px',height:'min(610px, calc(100vh - 24px))',minWidth:'450px',maxWidth:'min(760px, calc(100vw - 18px))',
            minHeight:'320px',maxHeight:'calc(100vh - 18px)',resize:'both',
            overflowY:'auto',overflowX:'hidden',boxSizing:'border-box',overscrollBehavior:'contain',scrollbarGutter:'stable',
            background:'linear-gradient(155deg,rgba(7,17,24,.992),rgba(10,27,36,.986))',color:'#f4f8fa',
            border:'1px solid rgba(111,174,192,.24)',borderRadius:'18px',
            boxShadow:'0 24px 72px rgba(0,0,0,.55), inset 0 1px rgba(255,255,255,.035)',
            backdropFilter:'blur(18px)',
            fontFamily:'"Segoe UI Variable Display","Aptos Display","Inter","Segoe UI",Arial,sans-serif',
            fontSize:'13px',lineHeight:'1.32',padding:'14px',pointerEvents:'auto',userSelect:'none',fontVariantNumeric:'tabular-nums',overflowAnchor:'none',
            scrollbarWidth:'thin',scrollbarColor:'#385461 transparent',outline:'none'
          });
          el.tabIndex=0;
          try{
            const saved=JSON.parse(localStorage.getItem('sentinel-overlay-pos-v1')||'null');
            if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
              el.style.left=Math.max(8,Math.min(window.innerWidth-450,saved.x))+'px';
              el.style.top=Math.max(8,Math.min(window.innerHeight-100,saved.y))+'px';
              el.style.right='auto'
            }
            const savedSize=JSON.parse(localStorage.getItem('sentinel-overlay-size-v13r1')||'null');
            if(savedSize&&Number.isFinite(savedSize.w)&&Number.isFinite(savedSize.h)){
              el.style.width=Math.max(450,Math.min(window.innerWidth-18,savedSize.w))+'px';
              el.style.height=Math.max(320,Math.min(window.innerHeight-18,savedSize.h))+'px'
            }
          }catch{}
          document.documentElement.appendChild(host);
          try{
            const ro=new ResizeObserver(()=>{try{const rr=el.getBoundingClientRect();localStorage.setItem('sentinel-overlay-size-v13r1',JSON.stringify({w:Math.round(rr.width),h:Math.round(rr.height)}))}catch{}});
            ro.observe(el);el.__sentinelResizeObserver=ro
          }catch{}
          let drag=null;
          const stop=()=>{if(!drag)return;const moved=drag.active;drag=null;if(moved)try{const r=el.getBoundingClientRect();localStorage.setItem('sentinel-overlay-pos-v1',JSON.stringify({x:r.left,y:r.top}))}catch{}};
          el.addEventListener('pointerdown',ev=>{
            if(ev.button!=null&&ev.button!==0)return;
            if(ev.target?.closest?.('button,select,input,textarea,a,label,[contenteditable="true"],[data-sentinel-no-drag]'))return;
            const r=el.getBoundingClientRect();
            if(ev.clientX>=r.right-12)return;
            drag={dx:ev.clientX-r.left,dy:ev.clientY-r.top,startX:ev.clientX,startY:ev.clientY,active:false,pointerId:ev.pointerId};
            try{el.setPointerCapture(ev.pointerId)}catch{}
            try{el.focus({preventScroll:true})}catch{}
          });
          el.addEventListener('pointermove',ev=>{
            if(!drag)return;
            if(!drag.active){
              if(Math.hypot(ev.clientX-drag.startX,ev.clientY-drag.startY)<4)return;
              drag.active=true;
              const r=el.getBoundingClientRect();el.style.left=r.left+'px';el.style.top=r.top+'px';el.style.right='auto'
            }
            const maxX=Math.max(8,window.innerWidth-el.offsetWidth-8),maxY=Math.max(8,window.innerHeight-el.offsetHeight-8);
            el.style.left=Math.max(8,Math.min(maxX,ev.clientX-drag.dx))+'px';
            el.style.top=Math.max(8,Math.min(maxY,ev.clientY-drag.dy))+'px';ev.preventDefault()
          });
          el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
          el.addEventListener('keydown',ev=>{
            if(ev.target?.closest?.('button,select,input,textarea,[contenteditable="true"]'))return;
            const line=Math.max(52,Math.round(el.clientHeight*.10)),page=Math.max(140,Math.round(el.clientHeight*.78));
            let handled=true;
            if(ev.key==='ArrowDown')el.scrollBy({top:line,behavior:'smooth'});
            else if(ev.key==='ArrowUp')el.scrollBy({top:-line,behavior:'smooth'});
            else if(ev.key==='PageDown'||(ev.key===' '&&!ev.shiftKey))el.scrollBy({top:page,behavior:'smooth'});
            else if(ev.key==='PageUp'||(ev.key===' '&&ev.shiftKey))el.scrollBy({top:-page,behavior:'smooth'});
            else if(ev.key==='Home')el.scrollTo({top:0,behavior:'smooth'});
            else if(ev.key==='End')el.scrollTo({top:el.scrollHeight,behavior:'smooth'});
            else handled=false;
            if(handled){ev.preventDefault();ev.stopPropagation()}
          });
        }

        const esc=v=>String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
        const n=(v,dg=0)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v).toFixed(dg):'—';
        const m=d.metrics||{},plan=d.plan||{},q=d.quality||{},short=m.shortModel||{};
        const analysisTransient=d.analysisTransient===true,analysisStale=d.analysisStale===true;
        const side=String(d.side||'WAIT').toUpperCase(),raw=String(q.rawSide||side||'WAIT').toUpperCase();
        const entryGateReady=q.entryReady===true;
        const rawLabel=raw==='BUY'?'CALL':raw==='SELL'?'PUT':'AGUARDAR';
        const signal=entryGateReady?(side==='BUY'?'CALL':side==='SELL'?'PUT':'AGUARDAR'):'AGUARDAR';
        const gold='#d9b85f',goldSoft='#f5dda0',goldDeep='#8f6a24';
        const tone=signal==='CALL'?'#69e1b5':signal==='PUT'?'#ff8f9c':gold;
        const duration=Number(d.durationMs||60000),strategy=String(d.strategy||'smart_confluence'),strategy2=String(d.strategy2||'none'),strategy3=String(d.strategy3||'none');
        const strategyCards=Array.isArray(d.strategyCards)?d.strategyCards:[],strategyConfluence=d.strategyConfluence||{},generalConsensus=d.generalConsensus||{},operational=d.operationalSignal||{};
        const shortWindow=duration<=60000,shortReady=!shortWindow||short.ready===true;
        const confidence=!analysisStale&&d.confidence!=null?Math.max(0,Math.min(100,Number(d.confidence))):null;
        const contextBuy=!analysisStale&&m.buyScore!=null?Math.max(0,Math.min(100,Number(m.buyScore))):null;
        const contextSell=!analysisStale&&m.sellScore!=null?Math.max(0,Math.min(100,Number(m.sellScore))):null;
        const buy=shortReady?contextBuy:null,sell=shortReady?contextSell:null;
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
        const reversalCall=!analysisStale&&shortReady&&short.reversalCallScore!=null?Math.max(0,Math.min(100,Number(short.reversalCallScore))):null;
        const reversalPut=!analysisStale&&shortReady&&short.reversalPutScore!=null?Math.max(0,Math.min(100,Number(short.reversalPutScore))):null;
        const reversalSide=reversalCall==null||reversalPut==null?'AGUARDAR':reversalCall>=reversalPut?'CALL':'PUT';
        const reversalStrength=reversalCall==null||reversalPut==null?null:Math.max(reversalCall,reversalPut);
        const reversalTimer=pre.kind==='reversal'&&preRemaining!=null&&preRemaining>0?preRemaining:null;
        const marketSummary=generalConsensus.rapid||{};
        const marketCallPct=Number.isFinite(Number(marketSummary.callPct))?Number(marketSummary.callPct):50;
        const marketPutPct=Number.isFinite(Number(marketSummary.putPct))?Number(marketSummary.putPct):50;
        const marketStrength=Number.isFinite(Number(marketSummary.strength))?Number(marketSummary.strength):0;
        const marketSummarySide=String(marketSummary.side||'AGUARDAR').toUpperCase();
        const marketActiveCount=Math.max(0,Number(marketSummary.activeCount||0));
        const gateReason=analysisStale||!liveNow?'SINCRONIZANDO':shortWindow&&!shortReady?'COLETANDO MICROESTRUTURA':analysisTransient||!analysisFresh?'ATUALIZANDO':entryGateReady?'PRONTO':String(q.blockLabel||q.status||'AGUARDAR');
        const gateDetail=analysisStale?'Feed temporariamente fora de sincronia; aguardando leitura atual.':shortWindow&&!shortReady?`Microestrutura curta em formação · ${Number(short.bars||0)}/5 barras mínimas.`:analysisTransient?'Atualizando a análise sem zerar a última leitura válida.':String(q.blockDetail||'Aguardando confirmação completa da estratégia.');
        let plannerHorizon=el.dataset.plannerHorizon||String(Math.round(duration/1000)),detailsOpen=false,uiTheme=el.dataset.themePreference==='light'?'light':el.dataset.themePreference==='dark'?'dark':'dark';
        try{
          detailsOpen=localStorage.getItem('sentinel-v101-details')==='1';
          if(!el.dataset.themePreference)uiTheme=localStorage.getItem('sentinel-overlay-theme-v1')==='light'?'light':'dark'
        }catch{}
        el.dataset.theme=uiTheme;
        const ink=uiTheme==='light'?'#111318':'#f8fbfb',muted=uiTheme==='light'?'#3d4650':'#dce8e6',subtle=uiTheme==='light'?'#626b76':'#afc1be';
        const neutralTone=uiTheme==='light'?'#1d2530':'#f2f7f6';
        const fieldBg=uiTheme==='light'?'#ffffff':'#061a1d',fieldInk=uiTheme==='light'?'#111318':'#fbffff',fieldBorder=uiTheme==='light'?'rgba(128,94,39,.40)':'rgba(226,194,105,.54)';
        const panelBg=uiTheme==='light'?'linear-gradient(150deg,#ffffff 0%,#f3ede2 100%)':'linear-gradient(155deg,#124648 0%,#0b3437 52%,#071f24 100%)';
        const panelBorder=uiTheme==='light'?'rgba(128,94,39,.30)':'rgba(226,194,105,.44)';
        const panelShadow=uiTheme==='light'?'0 10px 24px rgba(65,51,28,.12),inset 0 1px rgba(255,255,255,.92)':'0 11px 28px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.055),inset 0 -1px rgba(0,0,0,.22)';
        const heroPanelBg=uiTheme==='light'?'radial-gradient(circle at 82% 0%,rgba(194,151,57,.18),transparent 42%),linear-gradient(145deg,#fffefb 0%,#eee5d5 100%)':'radial-gradient(circle at 82% -8%,rgba(226,194,105,.18),transparent 42%),linear-gradient(150deg,#145254 0%,#0c3a3d 48%,#071f24 100%)';
        const heroShadow=uiTheme==='light'?'0 16px 38px rgba(78,58,24,.18),inset 0 1px #fff':'0 16px 42px rgba(0,0,0,.46),0 0 28px rgba(217,184,95,.07),inset 0 1px rgba(255,255,255,.075)';
        const goldGlow=uiTheme==='light'?'0 1px 0 rgba(255,255,255,.8)':'0 0 12px rgba(245,221,160,.28)';
        const callTone=uiTheme==='light'?'#087052':'#7ce9c1',putTone=uiTheme==='light'?'#972d43':'#ff99a8',warnTone=uiTheme==='light'?'#7a5a12':'#e6c879';
        const pausedReadings=d.pausedReadings&&typeof d.pausedReadings==='object'?d.pausedReadings:{};
        const isPaused=key=>pausedReadings[key]===true;
        const pauseBtn=key=>'<button data-sentinel-reading-pause="'+key+'" title="'+(isPaused(key)?'Ativar esta leitura':'Pausar esta leitura')+'" style="border:1px solid '+panelBorder+';border-radius:6px;height:20px;padding:0 5px;background:'+(isPaused(key)?'rgba(242,207,102,.13)':(uiTheme==='light'?'rgba(255,255,255,.82)':'rgba(255,255,255,.035)'))+';color:'+(isPaused(key)?warnTone:subtle)+';font:950 7.5px/1 inherit;cursor:pointer;white-space:nowrap">'+(isPaused(key)?'ATIVAR':'PAUSAR')+'</button>';
        let collapsedSummaries=[];
        try{collapsedSummaries=JSON.parse(localStorage.getItem('sentinel-summary-collapse-v118')||'[]');if(!Array.isArray(collapsedSummaries))collapsedSummaries=[]}catch{collapsedSummaries=[]}
        const isSummaryCollapsed=key=>collapsedSummaries.includes(key);
        const summaryBtn=key=>'<button data-sentinel-summary-collapse="'+key+'" title="'+(isSummaryCollapsed(key)?'Estender resumo':'Recolher resumo')+'" style="position:absolute;top:7px;right:7px;border:1px solid '+panelBorder+';border-radius:7px;width:23px;height:21px;background:'+(uiTheme==='light'?'linear-gradient(180deg,#fff,#f5efe3)':'linear-gradient(180deg,rgba(215,182,93,.13),rgba(215,182,93,.035))')+';color:'+goldSoft+';font:950 12px/1 inherit;cursor:pointer;display:grid;place-items:center;z-index:2">'+(isSummaryCollapsed(key)?'+':'−')+'</button>';
        const finalTone=finalSide==='CALL'?callTone:finalSide==='PUT'?putTone:warnTone;
        Object.assign(el.style,uiTheme==='light'?{background:'linear-gradient(155deg,#fffdf8,#e9e1d3)',color:'#15130f',border:'1px solid rgba(128,94,39,.36)',boxShadow:'0 28px 72px rgba(65,51,28,.20), inset 0 1px #fff'}:{background:'linear-gradient(160deg,#0b3537 0%,#0d3d3f 50%,#072428 100%)',color:'#f8fbfb',border:'1px solid rgba(226,194,105,.56)',boxShadow:'0 30px 88px rgba(0,0,0,.74),0 0 34px rgba(217,184,95,.055),0 0 0 1px rgba(217,184,95,.06) inset,inset 0 1px rgba(255,255,255,.075)'}, {fontVariantNumeric:'tabular-nums',overflowAnchor:'none'});
        const setupWindowHtml=preSide&&preRemaining!=null&&preRemaining>0&&!analysisStale?'<div style="margin-top:5px;padding:5px 7px;border-radius:7px;background:'+(uiTheme==='light'?'rgba(128,94,39,.09)':'rgba(201,166,91,.09)')+';border:1px solid '+panelBorder+';color:'+ink+';font-size:8px;font-weight:850;letter-spacing:.03em">JANELA DO SETUP · '+preSide+' · '+preRemaining+'s <span style="font-weight:650;color:'+muted+'">· validade, não contagem para entrar</span></div>':'';
        const plannerPlan=planner[plannerHorizon]||planner['30']||null;
        const horizonLabel=({30:'30 s',60:'1 min',120:'2 min',300:'5 min',600:'10 min',900:'15 min',3600:'1 h'})[plannerHorizon]||'30 s';
        const visibleAsset=String(d.asset||'—').trim().toUpperCase(),plannerAsset=String(plannerPlan?.asset||'').trim().toUpperCase();
        const previousVisibleAsset=String(el.dataset.futureAsset||'').trim().toUpperCase();
        const assetJustChanged=!!previousVisibleAsset&&previousVisibleAsset!==visibleAsset;
        if(assetJustChanged){
          const changedAt=Date.now();el.dataset.futureAssetChangedAt=String(changedAt);
          try{
            for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i)||'';if(k.startsWith('sentinel-future-decision-v13|')||k.startsWith('sentinel-future-expired-v13|'))localStorage.removeItem(k)}
          }catch{}
        }
        el.dataset.futureAsset=visibleAsset;
        const assetChangedAt=Math.max(0,Number(el.dataset.futureAssetChangedAt||0));
        const plannerGeneratedAt=Math.max(0,Number(plannerPlan?.generatedAt||0));
        const plannerMatchesAsset=!!plannerPlan&&!!visibleAsset&&visibleAsset!=='—'&&plannerAsset===visibleAsset;
        const plannerFreshAfterAssetSwitch=!assetChangedAt||plannerGeneratedAt>assetChangedAt;
        const entryReady=!analysisTransient&&!analysisStale&&liveNow&&analysisFresh&&entryGateReady&&['BUY','SELL'].includes(side);
        const plannerReadable=!assetJustChanged&&!analysisStale&&liveNow&&!!plannerPlan&&plannerMatchesAsset&&plannerFreshAfterAssetSwitch&&(analysisFresh||analysisTransient);
        const plannerConfirmed=plannerReadable&&plannerPlan?.directionReady===true;
        const rawOutlook=plannerReadable?String(plannerPlan?.displayBias||plannerPlan?.rawBias||plannerPlan?.bias||'NEUTRO').toUpperCase():'SEM LEITURA';
        const futureConfidence=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.confidence||plannerPlan?.modelConfidence||0))):0;
        const futureCallPct=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.displayCallProbability??plannerPlan?.callProbability??50))):50;
        const futurePutPct=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.displayPutProbability??plannerPlan?.putProbability??50))):50;
        let futureDisplayThreshold=70;
        try{const saved=Number(localStorage.getItem('sentinel-future-display-threshold-v13'));if(Number.isFinite(saved))futureDisplayThreshold=Math.max(50,Math.min(95,Math.round(saved)))}catch{}
        const candidateOutlook=!plannerReadable?'SEM LEITURA':!analysisStale&&futureCallPct>=futureDisplayThreshold&&futureCallPct>futurePutPct?'CALL':!analysisStale&&futurePutPct>=futureDisplayThreshold&&futurePutPct>futureCallPct?'PUT':'AGUARDAR';
        const futureProjectedPrice=plannerReadable&&Number.isFinite(Number(plannerPlan?.projectedPrice))?Number(plannerPlan.projectedPrice):null;
        const futureAgreement=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.agreement||0))):0;
        const futureSamples=plannerReadable?Math.max(0,Number(plannerPlan?.validation?.samples||0)):0;
        const futureRegime=plannerReadable?String(plannerPlan?.regime?.label||'—').toUpperCase():'—';
        const futureRegimeConfidence=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.regime?.confidence||0))):0;
        const futureHistoryWeight=plannerReadable?Math.max(0,Math.min(100,Number(plannerPlan?.validation?.historyWeight||0))):0;
        const futureBrier=plannerReadable&&Number.isFinite(Number(plannerPlan?.validation?.brierScore))?Number(plannerPlan.validation.brierScore):null;
        const futureBucketSamples=plannerReadable?Math.max(0,Number(plannerPlan?.validation?.bucketSamples||0)):0;
        const futureBucketWinRate=plannerReadable&&Number.isFinite(Number(plannerPlan?.validation?.bucketWinRate))?Number(plannerPlan.validation.bucketWinRate):null;
        const futureDecisionSamples=plannerReadable?Math.max(0,Number(plannerPlan?.validation?.decisionSamples||0)):0;
        const futureDecisionWinRate=plannerReadable&&Number.isFinite(Number(plannerPlan?.validation?.decisionWinRate))?Number(plannerPlan.validation.decisionWinRate):null;
        const futureConfidenceSource=plannerReadable?String(plannerPlan?.validation?.confidenceSource||'model').toUpperCase():'MODEL';
        const futureDiversity=plannerReadable?Math.max(0,Number(plannerPlan?.reliability?.evidenceFamilyCount||0)):0;
        const futureCorrelationPenalty=plannerReadable?Math.max(0,Number(plannerPlan?.reliability?.correlationPenalty||0)):0;
        const futureDrivers=plannerReadable&&Array.isArray(plannerPlan?.drivers)?plannerPlan.drivers.slice(0,4):[];

        // Decisão futura comprometida: oscilações normais não trocam CALL/PUT.
        // Em falha curta do feed, preserva a decisão e CONGELA a contagem até a leitura voltar.
        // Só invalida uma direção ativa com oposição forte e repetida; queda longa de feed expira por segurança.
        const decisionAsset=visibleAsset,decisionSeconds=Math.max(30,Number(plannerHorizon)||30);
        const decisionKey='sentinel-future-decision-v13|'+decisionAsset+'|'+String(plannerHorizon),expiredKey='sentinel-future-expired-v13|'+decisionAsset+'|'+String(plannerHorizon),decisionNow=Date.now(),maxFeedPauseMs=12000;
        let futureDecision=null,expiredDecision=null;
        try{futureDecision=JSON.parse(localStorage.getItem(decisionKey)||'null')}catch{futureDecision=null}
        try{expiredDecision=JSON.parse(localStorage.getItem(expiredKey)||'null')}catch{expiredDecision=null}
        if(futureDecision&&(String(futureDecision.asset||'')!==decisionAsset||Number(futureDecision.seconds)!==decisionSeconds)){
          try{localStorage.removeItem(decisionKey)}catch{};futureDecision=null
        }
        if(futureDecision&&!plannerReadable){
          const pausedAt=Number(futureDecision.feedPausedAt||0);
          if(!pausedAt)futureDecision.feedPausedAt=decisionNow;
          futureDecision.lastCheckedAt=decisionNow;
          if(decisionNow-Number(futureDecision.feedPausedAt||decisionNow)>maxFeedPauseMs){
            try{localStorage.removeItem(decisionKey)}catch{};futureDecision=null
          }else{
            try{localStorage.setItem(decisionKey,JSON.stringify(futureDecision))}catch{}
          }
        }else if(futureDecision&&plannerReadable&&Number(futureDecision.feedPausedAt||0)>0){
          const pausedMs=Math.max(0,decisionNow-Number(futureDecision.feedPausedAt));
          futureDecision.targetAt=Number(futureDecision.targetAt||decisionNow)+pausedMs;
          futureDecision.feedPausedAt=0;
          futureDecision.lastCheckedAt=decisionNow;
          try{localStorage.setItem(decisionKey,JSON.stringify(futureDecision))}catch{}
        }
        if(futureDecision&&plannerReadable&&decisionNow<Number(futureDecision.targetAt||0)){
          const ownPct=futureDecision.side==='CALL'?futureCallPct:futurePutPct,oppositePct=futureDecision.side==='CALL'?futurePutPct:futureCallPct;
          const oppositeSide=futureDecision.side==='CALL'?'PUT':'CALL';
          const strongInvalidation=plannerConfirmed&&candidateOutlook===oppositeSide&&oppositePct>=Math.max(72,futureDisplayThreshold+8)&&futureConfidence>=68&&futureAgreement>=62&&(oppositePct-ownPct)>=16;
          futureDecision.invalidations=strongInvalidation?Number(futureDecision.invalidations||0)+1:0;
          futureDecision.lastCheckedAt=decisionNow;
          if(futureDecision.invalidations>=2){
            try{localStorage.removeItem(decisionKey)}catch{};futureDecision=null
          }else{
            try{localStorage.setItem(decisionKey,JSON.stringify(futureDecision))}catch{}
          }
        }
        if(futureDecision&&plannerReadable&&decisionNow>Number(futureDecision.targetAt||0)+6000){
          expiredDecision={asset:decisionAsset,seconds:decisionSeconds,side:String(futureDecision.side||''),expiredAt:decisionNow,targetAt:Number(futureDecision.targetAt||0)};
          try{localStorage.setItem(expiredKey,JSON.stringify(expiredDecision));localStorage.removeItem(decisionKey)}catch{};futureDecision=null
        }
        // Depois que a janela "AGORA" termina, a mesma direção não pode relockar imediatamente.
        // A trava só é liberada quando o cenário deixa aquela direção (AGUARDAR/oposto) ou o ativo muda.
        if(expiredDecision&&(!plannerReadable||candidateOutlook!==String(expiredDecision.side||''))){
          try{localStorage.removeItem(expiredKey)}catch{};expiredDecision=null
        }
        const sameExpiredSide=!!expiredDecision&&plannerReadable&&candidateOutlook===String(expiredDecision.side||'');
        const candidatePct=candidateOutlook==='CALL'?futureCallPct:candidateOutlook==='PUT'?futurePutPct:0;
        const decisionEligible=!sameExpiredSide&&plannerReadable&&plannerConfirmed&&['CALL','PUT'].includes(candidateOutlook)&&candidatePct>=futureDisplayThreshold&&futureConfidence>=60&&futureAgreement>=55;
        if(!futureDecision&&decisionEligible){
          futureDecision={
            asset:decisionAsset,seconds:decisionSeconds,side:candidateOutlook,lockedAt:decisionNow,targetAt:decisionNow+decisionSeconds*1000,
            confidence:futureConfidence,callPct:futureCallPct,putPct:futurePutPct,agreement:futureAgreement,invalidations:0,feedPausedAt:0
          };
          try{localStorage.setItem(decisionKey,JSON.stringify(futureDecision))}catch{}
        }
        const decisionPausedAt=futureDecision?Number(futureDecision.feedPausedAt||0):0;
        const futureDecisionPaused=!!futureDecision&&decisionPausedAt>0&&!plannerReadable;
        const countdownNow=futureDecisionPaused?decisionPausedAt:decisionNow;
        const decisionRemaining=futureDecision?Math.max(0,Math.ceil((Number(futureDecision.targetAt||countdownNow)-countdownNow)/1000)):null;
        const feedPauseSeconds=futureDecisionPaused?Math.max(0,Math.ceil((decisionNow-decisionPausedAt)/1000)):0;
        const decisionPhase=!futureDecision?'WAIT':futureDecisionPaused?'PAUSED':decisionRemaining>0?'COUNTDOWN':'NOW';
        const displayCandidate=sameExpiredSide?'AGUARDAR':candidateOutlook;
        const outlook=futureDecision?.side||displayCandidate;
        const outlookTone=outlook==='CALL'?callTone:outlook==='PUT'?putTone:neutralTone;
        const futureActionLabel=futureDecision?(decisionPhase==='PAUSED'?(futureDecision.side+' · REVALIDANDO'):decisionPhase==='COUNTDOWN'?(futureDecision.side+' EM '+decisionRemaining+'s'):(futureDecision.side+' AGORA')):(sameExpiredSide?'AGUARDAR · NOVO CENÁRIO':(displayCandidate==='CALL'||displayCandidate==='PUT'?('CONFIRMANDO '+displayCandidate):('AGUARDAR · '+horizonLabel)));
        const futureDecisionStatus=futureDecision?(decisionPhase==='PAUSED'?'FEED PAUSADO':decisionPhase==='COUNTDOWN'?'DECISÃO TRAVADA':'ENTRADA AGORA'):(sameExpiredSide?'JANELA ENCERRADA':(displayCandidate==='CALL'||displayCandidate==='PUT'?'CONFIRMANDO':'SEM DECISÃO'));
        const futureDecisionConfidence=futureDecision?Math.max(0,Math.min(100,Number(futureDecision.confidence||0))):futureConfidence;
        const planHtml=plannerReadable?(
          '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:6px">'+
            '<div style="padding:6px;border-radius:8px;background:rgba(201,166,91,.06);border:1px solid '+panelBorder+';text-align:center"><span style="display:block;font-size:7px;color:'+subtle+';font-weight:900">CONFIANÇA ATUAL</span><b style="font-size:15px;color:'+goldSoft+'">'+n(futureConfidence,0)+'%</b></div>'+
            '<div style="padding:6px;border-radius:8px;background:rgba(114,230,185,.05);border:1px solid rgba(105,225,181,.11);text-align:center"><span style="display:block;font-size:7px;color:'+callTone+';font-weight:900">CALL</span><b style="font-size:15px;color:'+callTone+'">'+n(futureCallPct,0)+'%</b></div>'+
            '<div style="padding:6px;border-radius:8px;background:rgba(255,143,157,.05);border:1px solid rgba(255,143,156,.11);text-align:center"><span style="display:block;font-size:7px;color:'+putTone+';font-weight:900">PUT</span><b style="font-size:15px;color:'+putTone+'">'+n(futurePutPct,0)+'%</b></div>'+
          '</div>'+
          '<div style="font-size:9.1px;color:'+muted+';margin-bottom:4px;line-height:1.32;white-space:normal;overflow-wrap:anywhere">Agora <b style="color:'+ink+'">'+price(plannerPlan.currentPrice)+'</b>'+(futureProjectedPrice!=null?' · projeção <b style="color:'+outlookTone+'">'+price(futureProjectedPrice)+'</b>':'')+' · acordo '+n(futureAgreement,0)+'% · regime '+esc(futureRegime)+(futureRegimeConfidence?' '+n(futureRegimeConfidence,0)+'%':'')+(futureSamples?' · hist '+futureSamples:'')+(futureBucketSamples?' · faixa '+futureBucketSamples+(futureBucketWinRate!=null?' / '+n(futureBucketWinRate,0)+'%':''):'')+(futureDecisionSamples?' · decisões '+futureDecisionSamples+(futureDecisionWinRate!=null?' / '+n(futureDecisionWinRate,0)+'%':''):'')+(futureBrier!=null?' · Brier '+n(futureBrier,3):'')+(futureDiversity?' · '+futureDiversity+' famílias':'')+(futureCorrelationPenalty?' · corr −'+futureCorrelationPenalty:'')+'</div>'+
          '<div style="font-size:8.5px;color:'+subtle+';margin-bottom:6px;line-height:1.35;white-space:normal;overflow-wrap:anywhere">Motores: '+esc(futureDrivers.length?futureDrivers.join(' · '):'aguardando evidências do prazo')+'</div>'+
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">'+
            '<div style="padding:6px 7px;border-radius:8px;background:rgba(105,225,181,.05);border:1px solid rgba(105,225,181,.11)"><div style="font-size:8px;color:'+callTone+';font-weight:800">CALL — gatilho</div><div style="font-size:14px;font-weight:900;color:#69e1b5;margin-top:2px">'+price(plannerPlan.callTrigger)+'</div><div style="font-size:7.5px;color:'+muted+';margin-top:2px">invalida &lt; '+price(plannerPlan.callInvalidation)+'</div></div>'+
            '<div style="padding:6px 7px;border-radius:8px;background:rgba(255,143,156,.05);border:1px solid rgba(255,143,156,.11)"><div style="font-size:8px;color:'+putTone+';font-weight:800">PUT — gatilho</div><div style="font-size:14px;font-weight:900;color:#ff8f9c;margin-top:2px">'+price(plannerPlan.putTrigger)+'</div><div style="font-size:7.5px;color:'+muted+';margin-top:2px">invalida &gt; '+price(plannerPlan.putInvalidation)+'</div></div>'+
          '</div>'+
          '<div style="margin-top:6px;font-size:8.4px;line-height:1.38;color:'+muted+';min-height:22px"><b style="color:'+ink+'">CALL:</b> '+esc(plannerPlan.callRule||'—')+' · <b style="color:'+ink+'">PUT:</b> '+esc(plannerPlan.putRule||'—')+'</div>'+
          '<div style="margin-top:5px;font-size:8.4px;line-height:1.38;color:'+muted+';min-height:22px">'+(plannerConfirmed?'Cenário confirmado: '+esc(plannerPlan.basis||'confluência técnica')+'.':'Cenário em formação: '+esc(plannerPlan.basis||'leitura técnica disponível')+'.')+' Os níveis não são previsão garantida nem ordem de entrada.</div>'
        ):'<div style="font-size:9px;color:'+muted+'">Sem níveis acionáveis até a leitura deste prazo ficar atual.</div>';
        const strategyCardsHtml=[1,2,3].map(slot=>{
          const card=strategyCards.find(x=>Number(x?.slot)===slot)||{slot,active:false,label:'Estratégia não selecionada'};
          const pauseKey='strategy_'+slot,paused=isPaused(pauseKey);
          if(!card.active)return '<div data-sentinel-card="strategy-'+slot+'" style="padding:8px;border-radius:11px;background:'+panelBg+';border:1px dashed '+panelBorder+';min-width:0;min-height:124px;height:auto;overflow:visible;box-shadow:'+panelShadow+'"><div style="font-size:7.5px;font-weight:900;color:'+subtle+';letter-spacing:.06em">ESTRATÉGIA '+slot+'</div><div style="margin-top:10px;font-size:9px;font-weight:850;color:'+muted+'">Não selecionada</div><div style="margin-top:5px;font-size:7px;color:'+subtle+'">Não participa dos totais.</div></div>';
          const sSide=String(card.side||'NEUTRO').toUpperCase(),sTone=sSide==='CALL'?callTone:sSide==='PUT'?putTone:warnTone;
          const why=(card.reasons||[]).slice(0,1).map(x=>esc(x)).join(' · ');
          return '<div data-sentinel-card="strategy-'+slot+'" style="padding:8px;border-radius:11px;background:'+panelBg+';border:1px '+(paused?'dashed':'solid')+' '+panelBorder+';min-width:0;min-height:124px;height:auto;overflow:visible;box-shadow:'+panelShadow+';opacity:'+(paused?'.48':'1')+'"><div style="display:flex;justify-content:space-between;align-items:center;gap:4px"><span style="font-size:9.5px;font-weight:900;color:'+subtle+';letter-spacing:.045em">ESTRATÉGIA '+slot+'</span>'+pauseBtn(pauseKey)+'</div><div style="margin-top:3px;font-size:12.5px;font-weight:950;color:'+ink+';white-space:normal;overflow-wrap:anywhere" title="'+esc(card.label||'')+'">'+esc(card.label||'—')+'</div><div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:7px;gap:4px"><b style="font-size:16px;color:'+sTone+'">'+(paused?'PAUSADA':sSide)+'</b></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:5px"><div style="padding:5px;border-radius:7px;background:rgba(114,230,185,.05);text-align:center"><span style="display:block;font-size:7px;color:'+callTone+';font-weight:900">CALL</span><b style="font-size:14.5px;color:'+callTone+'">'+n(card.callPct,0)+'%</b></div><div style="padding:5px;border-radius:7px;background:rgba(255,143,157,.05);text-align:center"><span style="display:block;font-size:7px;color:'+putTone+';font-weight:900">PUT</span><b style="font-size:14.5px;color:'+putTone+'">'+n(card.putPct,0)+'%</b></div></div><div style="margin-top:5px;font-size:8.2px;line-height:1.18;color:'+muted+';min-height:20px;overflow:visible">'+(paused?'Fora dos totais enquanto pausada.':(why||'Sem gatilho forte neste ciclo.'))+'</div></div>';
        }).join('');
        const strategySummary=generalConsensus.strategies||{};
        const strategyFinalSide=String(strategySummary.side||strategyConfluence.side||'AGUARDAR').toUpperCase();
        const strategyFinalTone=strategyFinalSide==='CALL'?callTone:strategyFinalSide==='PUT'?putTone:neutralTone;
        const strategyAgreement=String(strategyConfluence.agreement||'SEM ESTRATÉGIAS');
        const strategyActiveCount=Math.max(0,Number(strategySummary.activeCount??strategyConfluence.activeCount??0));
        const strategyCallPct=Number.isFinite(Number(strategySummary.callPct))?Number(strategySummary.callPct):50;
        const strategyPutPct=Number.isFinite(Number(strategySummary.putPct))?Number(strategySummary.putPct):50;
        const executionPlan=planner[String(Math.round(duration/1000))]||planner['30']||null;
        const durationText=({30000:'30 s',60000:'1 min',120000:'2 min',300000:'5 min',600000:'10 min',900000:'15 min'})[duration]||Math.round(duration/1000)+' s';
        const generalStrictSide=String(generalConsensus.side||'AGUARDAR').toUpperCase(),generalLeanSide=String(generalConsensus.leanSide||generalStrictSide||'AGUARDAR').toUpperCase(),generalState=String(generalConsensus.state||'FORMANDO').toUpperCase();
        const generalCall=Number.isFinite(Number(generalConsensus.displayCallPct))?Number(generalConsensus.displayCallPct):Number.isFinite(Number(generalConsensus.callScore))?Number(generalConsensus.callScore):null;
        const generalPut=Number.isFinite(Number(generalConsensus.displayPutPct))?Number(generalConsensus.displayPutPct):Number.isFinite(Number(generalConsensus.putScore))?Number(generalConsensus.putScore):null;
        const generalStrength=Number.isFinite(Number(generalConsensus.displayStrength))?Math.max(0,Math.min(100,Number(generalConsensus.displayStrength))):Number.isFinite(Number(generalConsensus.strength))?Math.max(0,Math.min(100,Number(generalConsensus.strength))):Math.max(Number(generalCall||0),Number(generalPut||0));
        const generalEdge=Number.isFinite(Number(generalConsensus.edge))?Math.abs(Number(generalConsensus.edge)):Math.abs(Number(generalCall||0)-Number(generalPut||0));
        const generalTone=generalLeanSide==='CALL'?callTone:generalLeanSide==='PUT'?putTone:neutralTone;
        const strategyConfidence=Math.max(0,Math.min(100,Number(strategySummary.strength||0)));
        const marketConfidence=Math.max(0,Math.min(100,Number(marketStrength||0)));
        const totalActiveCount=Math.max(0,Number(generalConsensus.sources?.total||0));
        let marketDisplayThreshold=60,strategyDisplayThreshold=60,operationalDisplayThreshold=55,averageDisplayThreshold=60;
        try{
          const mv=Number(localStorage.getItem('sentinel-market-total-threshold-v13')),sv=Number(localStorage.getItem('sentinel-strategy-total-threshold-v13')),av=Number(localStorage.getItem('sentinel-average-total-threshold-v13'));
          if(Number.isFinite(mv))marketDisplayThreshold=Math.max(50,Math.min(95,Math.round(mv)));
          if(Number.isFinite(sv))strategyDisplayThreshold=Math.max(50,Math.min(95,Math.round(sv)));
          if(Number.isFinite(av))averageDisplayThreshold=Math.max(50,Math.min(95,Math.round(av)))
        }catch{}

        try{const saved=Number(localStorage.getItem('sentinel-total6-display-threshold-v13'));if(Number.isFinite(saved))operationalDisplayThreshold=Math.max(50,Math.min(95,Math.round(saved)))}catch{}
        const marketDisplaySide=!analysisStale&&marketCallPct>=marketDisplayThreshold&&marketCallPct>marketPutPct?'CALL':!analysisStale&&marketPutPct>=marketDisplayThreshold&&marketPutPct>marketCallPct?'PUT':'AGUARDAR';
        const strategyDisplaySide=!analysisStale&&strategyCallPct>=strategyDisplayThreshold&&strategyCallPct>strategyPutPct?'CALL':!analysisStale&&strategyPutPct>=strategyDisplayThreshold&&strategyPutPct>strategyCallPct?'PUT':'AGUARDAR';
        const marketDisplayTone=marketDisplaySide==='CALL'?callTone:marketDisplaySide==='PUT'?putTone:neutralTone;
        const strategyDisplayTone=strategyDisplaySide==='CALL'?callTone:strategyDisplaySide==='PUT'?putTone:neutralTone;
        const combinedCall=Number.isFinite(Number(generalCall))?Number(generalCall):50,combinedPut=Number.isFinite(Number(generalPut))?Number(generalPut):50;
        const thresholdSide=!analysisStale&&combinedCall>=operationalDisplayThreshold&&combinedCall>combinedPut?'CALL':!analysisStale&&combinedPut>=operationalDisplayThreshold&&combinedPut>combinedCall?'PUT':'AGUARDAR';
        const averageValues=[marketCallPct,strategyCallPct,combinedCall].filter(v=>Number.isFinite(Number(v)));
        const averageCallPct=averageValues.length?Math.round(averageValues.reduce((a,v)=>a+Number(v),0)/averageValues.length):50,averagePutPct=100-averageCallPct;
        const averageConfidenceValues=[marketConfidence,strategyConfidence,generalStrength].filter(v=>Number.isFinite(Number(v)));
        const averageConfidence=averageConfidenceValues.length?Math.round(averageConfidenceValues.reduce((a,v)=>a+Number(v),0)/averageConfidenceValues.length):0;
        const averageSide=!analysisStale&&averageCallPct>=averageDisplayThreshold&&averageCallPct>averagePutPct?'CALL':!analysisStale&&averagePutPct>=averageDisplayThreshold&&averagePutPct>averageCallPct?'PUT':'AGUARDAR';
        const averageTone=averageSide==='CALL'?callTone:averageSide==='PUT'?putTone:neutralTone;
        const operationalState=String(operational.state||'AGUARDAR').toUpperCase();
        const operationalEngineSide=['CALL','PUT'].includes(String(operational.side||'').toUpperCase())?String(operational.side).toUpperCase():'AGUARDAR';
        const operationalFutureSide=['CALL','PUT'].includes(String(operational.futureSide||'').toUpperCase())?String(operational.futureSide).toUpperCase():'NEUTRO';
        const operationalFutureConfidence=Math.max(0,Math.min(100,Number(operational.futureConfidence||0)));
        const totalSixSide=thresholdSide;
        const totalSixDirectional=['CALL','PUT'].includes(totalSixSide)&&!analysisStale;
        const totalSixTone=totalSixSide==='CALL'?callTone:totalSixSide==='PUT'?putTone:neutralTone;
        const operationalSide=operationalEngineSide;
        const operationalTone=operationalSide==='CALL'?callTone:operationalSide==='PUT'?putTone:neutralTone;
        const operationalDirectional=['CALL','PUT'].includes(operationalSide)&&!analysisStale;
        const operationalReady=operational.ready===true&&operationalState==='ENTRADA'&&operationalDirectional&&liveNow&&analysisFresh;
        const operationalDisplay=totalSixSide;
        const operationalStatus=operationalReady?'ENTRADA AGORA':totalSixDirectional?'VIÉS DOS 6':'AGUARDAR';
        const hasNum=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
        const operationalTime=operationalReady&&hasNum(operational.entryAt)?new Date(Number(operational.entryAt)).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null;
        const operationalTrigger=hasNum(operational.trigger)?Number(operational.trigger):null;
        const operationalInvalidation=hasNum(operational.invalidation)?Number(operational.invalidation):null;
        const operationalReason=String(operational.reason||'Aguardando consenso suficiente.');
        const operationalValidation=operational.validation||{};
        const operationalSamples=Math.max(0,Number(operationalValidation.samples||0)),operationalWinRate=Number(operationalValidation.winRate||0),operationalSmoothedWinRate=Number(operationalValidation.smoothedWinRate||0);
        const operationalTechnicalConfidence=Number.isFinite(Number(operational.technicalConfidence))?Math.max(0,Math.min(100,Number(operational.technicalConfidence))):Math.max(0,Math.min(100,Number(generalStrength||0)));
        const expiryInfo=operational.expiration||{},brokerExpiryMs=hasNum(expiryInfo.brokerMs)?Number(expiryInfo.brokerMs):hasNum(d.brokerExpirationDurationMs)?Number(d.brokerExpirationDurationMs):null;
        const expiryDetected=expiryInfo.detected===true,expiryMatch=expiryInfo.match===true;
        const expiryLabel=!expiryDetected?'NÃO VERIFICADA':expiryMatch?'CONFIRMADA':'DIVERGENTE';
        const expiryTone=expiryMatch?callTone:expiryDetected?putTone:warnTone;
        const expiryDurationLabel=brokerExpiryMs==null?'—':brokerExpiryMs>=60000?(brokerExpiryMs/60000).toFixed(brokerExpiryMs%60000===0?0:1)+' min':Math.round(brokerExpiryMs/1000)+' s';

        if(!el.dataset.controlReady){
          el.dataset.controlReady='1';
          const run=async payload=>{
            const msg=el.querySelector('[data-sentinel-control-msg]');if(msg)msg.textContent='Aplicando…';
            try{const res=await window.__sentinelOverlayAction?.(payload);if(msg)msg.textContent=res?.message||'Aplicado'}
            catch(e){if(msg)msg.textContent='Erro: '+String(e?.message||e)}
          };
          el.addEventListener('pointerdown',ev=>{if(ev.target?.closest?.('select[data-sentinel-setting],select[data-sentinel-plan-horizon],input[data-sentinel-op-threshold],input[data-sentinel-future-threshold],input[data-sentinel-total-threshold]'))el.dataset.selectLock='1'},true);
          el.addEventListener('focusout',ev=>{if(ev.target?.matches?.('select[data-sentinel-setting],select[data-sentinel-plan-horizon],input[data-sentinel-op-threshold],input[data-sentinel-future-threshold],input[data-sentinel-total-threshold]'))setTimeout(()=>{el.dataset.selectLock='0'},160)},true);
          el.addEventListener('change',ev=>{
            const tt=ev.target?.closest?.('[data-sentinel-total-threshold]');
            if(tt){
              const kind=String(tt.getAttribute('data-sentinel-total-threshold')||''),value=Math.max(50,Math.min(95,Math.round(Number(tt.value)||60)));
              tt.value=String(value);
              const key=kind==='market'?'sentinel-market-total-threshold-v13':kind==='strategy'?'sentinel-strategy-total-threshold-v13':kind==='average'?'sentinel-average-total-threshold-v13':null;
              if(key)try{localStorage.setItem(key,String(value))}catch{}
              el.dataset.selectLock='0';
              queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return
            }
            const ot=ev.target?.closest?.('[data-sentinel-op-threshold]');
            if(ot){
              const value=Math.max(50,Math.min(95,Math.round(Number(ot.value)||70)));
              ot.value=String(value);
              try{localStorage.setItem('sentinel-total6-display-threshold-v13',String(value))}catch{}
              el.dataset.selectLock='0';
              queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return
            }
            const ft=ev.target?.closest?.('[data-sentinel-future-threshold]');
            if(ft){
              const value=Math.max(50,Math.min(95,Math.round(Number(ft.value)||70)));
              ft.value=String(value);
              try{
                localStorage.setItem('sentinel-future-display-threshold-v13',String(value));
                const asset=String(window.__sentinelLastOverlayData?.asset||'—').trim().toUpperCase(),hz=String(el.dataset.plannerHorizon||Math.round(Number(window.__sentinelLastOverlayData?.durationMs||30000)/1000));
                localStorage.removeItem('sentinel-future-decision-v13|'+asset+'|'+hz)
              }catch{}
              el.dataset.selectLock='0';
              queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return
            }
            const ph=ev.target?.closest?.('[data-sentinel-plan-horizon]');
            if(ph){
              try{const asset=String(window.__sentinelLastOverlayData?.asset||'—').trim().toUpperCase();localStorage.removeItem('sentinel-future-decision-v13|'+asset+'|'+String(ph.value))}catch{}
              el.dataset.plannerHorizon=ph.value;setTimeout(()=>{el.dataset.selectLock='0';ph.blur?.()},120);return
            }
            const x=ev.target?.closest?.('[data-sentinel-setting]');if(!x)return;
            if(x.getAttribute('data-sentinel-setting')==='duration')el.dataset.plannerHorizon=String(Math.round(Number(x.value)/1000));
            run({action:'setting',key:x.getAttribute('data-sentinel-setting'),value:x.value});
            setTimeout(()=>{el.dataset.selectLock='0';x.blur?.()},160)
          });
          el.addEventListener('click',ev=>{
            const theme=ev.target?.closest?.('[data-sentinel-theme]');
            if(theme){ev.preventDefault();ev.stopPropagation();const next=theme.getAttribute('data-sentinel-theme')==='light'?'light':'dark';el.dataset.themePreference=next;el.dataset.theme=next;try{localStorage.setItem('sentinel-overlay-theme-v1',next)}catch{}queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return}
            const rp=ev.target?.closest?.('[data-sentinel-reading-pause]');
            if(rp){
              ev.preventDefault();ev.stopPropagation();
              const reading=rp.getAttribute('data-sentinel-reading-pause')||'';
              const next=!(window.__sentinelLastOverlayData?.pausedReadings?.[reading]===true);
              run({action:'setting',key:'readingPause',reading,value:next});return
            }
            const ex=ev.target?.closest?.('[data-sentinel-summary-collapse]');
            if(ex){
              ev.preventDefault();ev.stopPropagation();
              const key=ex.getAttribute('data-sentinel-summary-collapse')||'';
              let list=[];try{list=JSON.parse(localStorage.getItem('sentinel-summary-collapse-v118')||'[]');if(!Array.isArray(list))list=[]}catch{list=[]}
              list=list.includes(key)?list.filter(x=>x!==key):[...list,key];
              try{localStorage.setItem('sentinel-summary-collapse-v118',JSON.stringify(list))}catch{}
              queueMicrotask(()=>window.__sentinelRenderOverlay?.(window.__sentinelLastOverlayData));return
            }
            const sc=ev.target?.closest?.('[data-sentinel-scroll]');
            if(sc){
              ev.preventDefault();ev.stopPropagation();
              const nearBottom=el.scrollTop+el.clientHeight>=el.scrollHeight-24;
              el.scrollTo({top:nearBottom?0:el.scrollHeight,behavior:'smooth'});
              return
            }
            const a=ev.target?.closest?.('[data-sentinel-action]');
            if(a){ev.preventDefault();ev.stopPropagation();run({action:a.getAttribute('data-sentinel-action')});return}
            const t=ev.target?.closest?.('[data-sentinel-toggle]');
            if(t){ev.preventDefault();const key=t.getAttribute('data-sentinel-toggle'),box=el.querySelector('[data-sentinel-section="'+key+'"]'),open=box?.style.display==='none';if(box)box.style.display=open?'block':'none';const arrow=t.querySelector('[data-sentinel-arrow]');if(arrow)arrow.textContent=open?'⌃':'⌄';try{if(key==='details')localStorage.setItem('sentinel-v101-details',open?'1':'0')}catch{}}
          });
        }

        const rootNode=el.getRootNode?.(),focused=rootNode?.activeElement||document.activeElement;if(el.dataset.selectLock==='1'||(focused&&el.contains(focused)&&focused.matches?.('select,input[data-sentinel-op-threshold],input[data-sentinel-future-threshold],input[data-sentinel-total-threshold]')))return;

        
        const stableScrollTop=el.scrollTop;
        const stableRect=el.getBoundingClientRect();
        const stableLeft=el.style.left,stableTop=el.style.top,stableRight=el.style.right;
        el.innerHTML=`
          <div data-sentinel-drag style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;cursor:grab;padding:3px 2px 10px;border-bottom:1px solid ${panelBorder}">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;padding-top:3px">
              <span style="width:9px;height:9px;border-radius:999px;background:#7ce9c1;box-shadow:0 0 14px rgba(124,233,193,.52);flex:0 0 auto"></span>
              <div>
                <div style="font-size:13.5px;font-weight:950;letter-spacing:.105em;color:${ink}">SENTINEL <span class="sentinel-metal-gold" style="font-weight:900">V${esc(d.agentVersion||'13.1.0')}</span></div>
                <div style="font-size:9px;font-weight:720;color:${muted};margin-top:2px">${esc(String(d.brokerMode||d.mode||'demo').toUpperCase())} · painel premium de análise</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:0">
              <div style="display:flex;align-items:center;gap:5px;max-width:100%">
                <div style="display:flex;align-items:center;padding:2px;border-radius:9px;background:${uiTheme==='light'?'rgba(126,101,58,.08)':'rgba(215,182,93,.055)'};border:1px solid ${panelBorder}">
                  <button data-sentinel-theme="light" title="Tema claro" style="border:0;border-radius:7px;padding:6px 8px;background:${uiTheme==='light'?'linear-gradient(180deg,#fff,#f4eee2)':'transparent'};color:${uiTheme==='light'?'#2b241b':subtle};font:900 8px/1 inherit;cursor:pointer">CLARO</button>
                  <button data-sentinel-theme="dark" title="Tema escuro" style="border:0;border-radius:7px;padding:6px 8px;background:${uiTheme==='dark'?'linear-gradient(180deg,rgba(215,182,93,.20),rgba(215,182,93,.06))':'transparent'};color:${uiTheme==='dark'?goldSoft:'#746957'};font:900 8px/1 inherit;cursor:pointer">ESCURO</button>
                </div>
                <button data-sentinel-action="refresh" title="Atualizar leitura da corretora" style="border:1px solid ${panelBorder};border-radius:8px;height:29px;padding:0 8px;background:${uiTheme==='light'?'linear-gradient(180deg,#fff,#f4eee2)':'linear-gradient(180deg,rgba(215,182,93,.12),rgba(215,182,93,.035))'};color:${goldSoft};font:900 7.5px/1 inherit;cursor:pointer;white-space:nowrap">↻ LEITURA</button>
                <button data-sentinel-scroll title="Descer / voltar ao topo" style="border:1px solid ${panelBorder};border-radius:8px;width:29px;height:29px;background:${uiTheme==='light'?'#fff':'linear-gradient(180deg,rgba(215,182,93,.12),rgba(215,182,93,.035))'};color:${goldSoft};font:950 15px/1 inherit;cursor:pointer;display:grid;place-items:center">↓</button>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,minmax(78px,1fr));gap:5px;width:100%;max-width:310px">
                <button data-sentinel-action="start" style="height:31px;border:1px solid rgba(215,182,93,.56);border-radius:8px;background:${runtime==='running'?'linear-gradient(180deg,#f2dc9a,#cda646)':'linear-gradient(180deg,rgba(215,182,93,.18),rgba(215,182,93,.06))'};color:${runtime==='running'?'#19130a':goldSoft};font:950 8.7px/1 inherit;letter-spacing:.035em;cursor:pointer;white-space:nowrap;overflow:hidden">● INICIAR</button>
                <button data-sentinel-action="pause" style="height:31px;border:1px solid rgba(215,182,93,.42);border-radius:8px;background:${runtime==='paused'?'linear-gradient(180deg,#ead18b,#b99137)':'linear-gradient(180deg,rgba(215,182,93,.12),rgba(215,182,93,.035))'};color:${runtime==='paused'?'#19130a':goldSoft};font:950 8.7px/1 inherit;letter-spacing:.035em;cursor:pointer;white-space:nowrap;overflow:hidden">Ⅱ PAUSAR</button>
                <button data-sentinel-action="stop" style="height:31px;border:1px solid rgba(215,182,93,.34);border-radius:8px;background:${runtime==='stopped'?'linear-gradient(180deg,rgba(140,104,35,.78),rgba(78,57,20,.88))':'linear-gradient(180deg,rgba(215,182,93,.09),rgba(215,182,93,.025))'};color:${goldSoft};font:950 8.7px/1 inherit;letter-spacing:.035em;cursor:pointer;white-space:nowrap;overflow:hidden">■ PARAR</button>
              </div>
              <div data-sentinel-control-msg style="min-height:8px;max-width:250px;font-size:7.2px;font-weight:800;color:${goldSoft};line-height:1.1;text-align:right"></div>
            </div>
          </div>

          <div class="sentinel-shine" data-sentinel-role="horizon-outlook" data-sentinel-card="horizon" style="position:relative;margin-top:10px;padding:10px 11px;min-height:286px;height:auto;overflow:visible;border:1px solid ${uiTheme==='light'?'rgba(145,105,34,.42)':'rgba(226,194,105,.66)'};border-left:4px solid ${outlookTone};background:${heroPanelBg};border-radius:15px;box-sizing:border-box;box-shadow:${heroShadow}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;min-height:31px;overflow:visible">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="sentinel-metal-gold" style="font-size:12.5px;font-weight:950;letter-spacing:.055em">CENÁRIO FUTURO POR PRAZO</span><span style="font-size:7.8px;font-weight:950;color:${ink};letter-spacing:.06em">PRÓXIMO PASSO</span></div>
              <div style="display:flex;align-items:center;gap:5px">
                <select data-sentinel-plan-horizon title="Prazo do cenário (a expiração da operação é configurada abaixo)" style="height:27px;min-width:82px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:900;outline:none"><option value="30" ${plannerHorizon==='30'?'selected':''}>30 s</option><option value="60" ${plannerHorizon==='60'?'selected':''}>1 min</option><option value="120" ${plannerHorizon==='120'?'selected':''}>2 min</option><option value="300" ${plannerHorizon==='300'?'selected':''}>5 min</option><option value="600" ${plannerHorizon==='600'?'selected':''}>10 min</option><option value="900" ${plannerHorizon==='900'?'selected':''}>15 min</option><option value="3600" ${plannerHorizon==='3600'?'selected':''}>1 h</option></select>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap;margin-top:7px;padding:7px 8px;border-radius:10px;background:${uiTheme==='light'?'rgba(128,94,39,.07)':'rgba(215,182,93,.065)'};border:1px solid ${panelBorder};box-shadow:inset 0 1px rgba(255,255,255,.04)">
              <span style="font-size:8.2px;color:${muted};font-weight:900">MOSTRAR CALL / PUT A PARTIR DE</span>
              <div style="display:flex;align-items:center;gap:3px"><input data-sentinel-future-threshold type="number" min="50" max="95" step="1" value="${futureDisplayThreshold}" style="width:50px;height:23px;border:1px solid ${fieldBorder};border-radius:7px;background:${fieldBg};color:${fieldInk};font:950 11px/1 inherit;padding:0 5px;text-align:center;outline:none"><b style="font-size:9px;color:${goldSoft}">%</b></div>
              <span style="font-size:8px;color:${subtle};font-weight:800">viés interno: <b style="color:${rawOutlook==='CALL'?callTone:rawOutlook==='PUT'?putTone:neutralTone}">${esc(rawOutlook)}</b></span>
            </div>
            <div style="display:flex;align-items:baseline;gap:10px;margin:9px 0 6px;flex-wrap:wrap;min-height:32px;overflow:visible;white-space:normal"><b style="font-size:24px;line-height:1;color:${outlookTone};letter-spacing:.015em;text-shadow:0 0 16px color-mix(in srgb,${outlookTone} 28%,transparent)">${esc(futureActionLabel)}</b><span style="color:${decisionPhase==='NOW'?goldSoft:(outlook==='CALL'?callTone:outlook==='PUT'?putTone:neutralTone)};font-size:9.3px;font-weight:950">${esc(futureDecisionStatus)}</span><span style="color:${goldSoft};font-size:9.3px;font-weight:950;text-shadow:${goldGlow}">${plannerReadable||futureDecision?'CONF '+(futureConfidenceSource==='CALIBRATED'?'CAL ':'MODELO ')+n(futureDecisionConfidence,0)+'%':''}</span><span style="color:${muted};font-size:9.3px;font-weight:850">${liveLabel}</span></div>
            <div style="color:${muted};font-size:10.2px;font-weight:780;line-height:1.42;margin-bottom:7px;min-height:30px;overflow:visible">${futureDecisionPaused?('Feed pausado há '+feedPauseSeconds+'s. A decisão '+futureDecision.side+' foi preservada e a contagem está congelada até a leitura ser revalidada.'):analysisStale||!liveNow?'Feed fora da leitura atual: nenhuma nova decisão será criada até revalidar.':analysisTransient?'Atualizando cenário com a última leitura válida.':!analysisFresh?'Atualizando cálculo deste prazo.':!plannerReadable?'Aguardando dados atuais deste prazo.':futureDecision?(decisionPhase==='COUNTDOWN'?('Decisão '+futureDecision.side+' mantida por '+decisionRemaining+'s. O motor continua analisando e só cancela com invalidação oposta forte e repetida.'):('ENTRADA '+futureDecision.side+' AGORA. A nova previsão será liberada em poucos segundos.')):candidateOutlook==='AGUARDAR'?('Sem decisão: CALL '+n(futureCallPct,0)+'% · PUT '+n(futurePutPct,0)+'% · limite '+futureDisplayThreshold+'%.'):('Confirmando '+candidateOutlook+' antes de iniciar a contagem regressiva.')}</div>
            ${planHtml}
          </div>



          <div class="sentinel-metal-gold" style="font-size:11.5px;font-weight:950;letter-spacing:.065em;margin-top:10px;margin-bottom:7px">TOTAIS</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:stretch">
            <div class="sentinel-shine" data-sentinel-summary="market-total" style="position:relative;padding:10px 34px 10px 10px;min-height:${isSummaryCollapsed('market-total')?'44px':'118px'};height:${isSummaryCollapsed('market-total')?'44px':'auto'};box-sizing:border-box;overflow:${isSummaryCollapsed('market-total')?'hidden':'visible'};border-radius:13px;background:${panelBg};border:1px solid ${marketDisplaySide!=='AGUARDAR'?marketDisplayTone:panelBorder};min-width:0;box-shadow:${panelShadow}">
              <div style="font-size:10.2px;font-weight:950;color:${ink};white-space:nowrap">TOTAL MERCADO</div>
              <div style="margin-top:2px;font-size:7.8px;font-weight:800;color:${muted}">${marketActiveCount}/3 · CONF ${n(marketConfidence,0)}%</div>
              ${summaryBtn('market-total')}
              <div style="margin-top:5px;font-size:18px;font-weight:950;line-height:1;color:${marketDisplayTone}">${marketDisplaySide}</div>
              <div style="display:flex;align-items:center;gap:9px;margin-top:7px;font-size:8px;font-weight:900"><span style="color:${callTone}">CALL <b style="font-size:13px">${n(marketCallPct,0)}%</b></span><span style="color:${putTone}">PUT <b style="font-size:13px">${n(marketPutPct,0)}%</b></span></div>
              <div style="position:absolute;right:8px;bottom:7px;display:flex;align-items:center;gap:2px" title="Limite visual para mostrar CALL ou PUT"><input data-sentinel-total-threshold="market" data-sentinel-market-threshold type="number" min="50" max="95" step="1" value="${marketDisplayThreshold}" style="width:44px;height:23px;border:1px solid ${fieldBorder};border-radius:7px;background:${fieldBg};color:${fieldInk};font:950 11px/1 inherit;padding:0 4px;text-align:center;outline:none"><b style="font-size:9px;color:${goldSoft}">%</b></div>
            </div>

            <div class="sentinel-shine" data-sentinel-summary="strategy-total" style="position:relative;padding:10px 34px 10px 10px;min-height:${isSummaryCollapsed('strategy-total')?'44px':'118px'};height:${isSummaryCollapsed('strategy-total')?'44px':'auto'};box-sizing:border-box;overflow:${isSummaryCollapsed('strategy-total')?'hidden':'visible'};border-radius:13px;background:${panelBg};border:1px solid ${strategyDisplaySide!=='AGUARDAR'?strategyDisplayTone:panelBorder};min-width:0;box-shadow:${panelShadow}">
              <div style="font-size:10.2px;font-weight:950;color:${ink};white-space:nowrap">TOTAL ESTRATÉGIAS</div>
              <div style="margin-top:2px;font-size:7.8px;font-weight:800;color:${muted}">${strategyActiveCount}/3 · CONF ${n(strategyConfidence,0)}%</div>
              ${summaryBtn('strategy-total')}
              <div style="margin-top:5px;font-size:18px;font-weight:950;line-height:1;color:${strategyDisplayTone}">${strategyDisplaySide}</div>
              <div style="display:flex;align-items:center;gap:9px;margin-top:7px;font-size:8px;font-weight:900"><span style="color:${callTone}">CALL <b style="font-size:13px">${n(strategyCallPct,0)}%</b></span><span style="color:${putTone}">PUT <b style="font-size:13px">${n(strategyPutPct,0)}%</b></span></div>
              <div style="position:absolute;right:8px;bottom:7px;display:flex;align-items:center;gap:2px" title="Limite visual para mostrar CALL ou PUT"><input data-sentinel-total-threshold="strategy" data-sentinel-strategy-threshold type="number" min="50" max="95" step="1" value="${strategyDisplayThreshold}" style="width:44px;height:23px;border:1px solid ${fieldBorder};border-radius:7px;background:${fieldBg};color:${fieldInk};font:950 11px/1 inherit;padding:0 4px;text-align:center;outline:none"><b style="font-size:9px;color:${goldSoft}">%</b></div>
            </div>

            <div class="sentinel-shine" data-sentinel-summary="operational-total" data-sentinel-card="operational-signal" style="position:relative;padding:10px 34px 10px 10px;min-height:${isSummaryCollapsed('operational-total')?'44px':'118px'};height:${isSummaryCollapsed('operational-total')?'44px':'auto'};box-sizing:border-box;overflow:${isSummaryCollapsed('operational-total')?'hidden':'visible'};border-radius:13px;background:${panelBg};border:1px solid ${totalSixDirectional?totalSixTone:panelBorder};min-width:0;box-shadow:${panelShadow}">
              <div style="font-size:10.2px;font-weight:950;color:${ink};white-space:nowrap">TOTAL DOS 6</div>
              <div style="margin-top:2px;font-size:7.8px;font-weight:800;color:${muted}">${totalActiveCount}/6 · CONF ${n(generalStrength,0)}%</div>
              ${summaryBtn('operational-total')}
              <div style="margin-top:5px;font-size:18px;font-weight:950;line-height:1;color:${totalSixTone}">${operationalDisplay}</div>
              <div style="display:flex;align-items:center;gap:9px;margin-top:7px;font-size:8px;font-weight:900"><span style="color:${callTone}">CALL <b style="font-size:13px">${n(generalCall,0)}%</b></span><span style="color:${putTone}">PUT <b style="font-size:13px">${n(generalPut,0)}%</b></span></div>
              <div style="position:absolute;right:8px;bottom:7px;display:flex;align-items:center;gap:2px" title="Limite visual para mostrar CALL ou PUT"><input data-sentinel-op-threshold type="number" min="50" max="95" step="1" value="${operationalDisplayThreshold}" style="width:44px;height:23px;border:1px solid ${fieldBorder};border-radius:7px;background:${fieldBg};color:${fieldInk};font:950 11px/1 inherit;padding:0 4px;outline:none;text-align:center"><b style="font-size:9px;color:${goldSoft}">%</b></div>
            </div>
          </div>

          <div class="sentinel-shine" data-sentinel-summary="average-total" style="position:relative;margin-top:8px;padding:10px 11px;min-height:72px;height:auto;box-sizing:border-box;overflow:visible;border-radius:13px;background:${panelBg};border:1px solid ${averageSide!=='AGUARDAR'?averageTone:panelBorder};box-shadow:${panelShadow}">
            <div style="display:grid;grid-template-columns:minmax(0,1.45fr) .58fr .58fr .52fr;gap:8px;align-items:center;height:100%">
              <div style="min-width:0"><div class="sentinel-metal-gold" style="font-size:11.2px;font-weight:950;letter-spacing:.04em">MÉDIA DOS 3 TOTAIS</div><div style="display:flex;align-items:baseline;gap:7px;margin-top:2px"><b style="font-size:17px;color:${averageTone}">${averageSide}</b><span style="font-size:8px;font-weight:900;color:${goldSoft}">CONF MÉDIA ${n(averageConfidence,0)}%</span></div></div>
              <div style="text-align:center;color:${callTone};font-size:8px;font-weight:900">CALL<b style="display:block;font-size:14px">${n(averageCallPct,0)}%</b></div>
              <div style="text-align:center;color:${putTone};font-size:8px;font-weight:900">PUT<b style="display:block;font-size:14px">${n(averagePutPct,0)}%</b></div>
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:2px" title="Limite visual da média"><input data-sentinel-total-threshold="average" data-sentinel-average-threshold type="number" min="50" max="95" step="1" value="${averageDisplayThreshold}" style="width:44px;height:24px;border:1px solid ${fieldBorder};border-radius:7px;background:${fieldBg};color:${fieldInk};font:950 11px/1 inherit;padding:0 4px;text-align:center;outline:none"><b style="font-size:9px;color:${goldSoft}">%</b></div>
            </div>
          </div>


          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;margin-bottom:6px">
            <div><div style="font-size:10px;font-weight:950;letter-spacing:.045em;color:${ink}">LEITURA RÁPIDA DO MERCADO</div><div style="font-size:7.8px;color:${subtle};margin-top:1px">3 leituras independentes</div></div>
            <span style="font-size:7.8px;font-weight:900;color:${muted}">${marketActiveCount}/3 ativas</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:start">
            <div data-sentinel-role="confluence" data-sentinel-card="quick-confluence" style="padding:8px;border-radius:11px;background:${panelBg};border:1px ${isPaused('market_confluence')?'dashed':'solid'} ${panelBorder};min-width:0;min-height:124px;height:auto;overflow:visible;box-shadow:${panelShadow};opacity:${isPaused('market_confluence')?'.48':'1'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px"><span style="font-size:10px;font-weight:950;color:${ink}">CONFLUÊNCIA TÉCNICA</span>${pauseBtn('market_confluence')}</div>
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:4px;margin-top:7px"><b style="font-size:15px;color:${finalTone}">${isPaused('market_confluence')?'PAUSADA':finalSide}</b><span style="font-size:7.2px;color:${subtle}">força ${n(finalStrength,0)}%</span></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px"><div style="padding:5px;border-radius:7px;background:rgba(114,230,185,.05);text-align:center"><span style="font-size:7px;color:${callTone};font-weight:900">CALL</span><b style="display:block;font-size:15.5px;color:${callTone}">${n(finalCall,0)}%</b></div><div style="padding:5px;border-radius:7px;background:rgba(255,143,157,.05);text-align:center"><span style="font-size:7px;color:${putTone};font-weight:900">PUT</span><b style="display:block;font-size:15.5px;color:${putTone}">${n(finalPut,0)}%</b></div></div>
              <div style="margin-top:5px;font-size:8px;color:${subtle}">${isPaused('market_confluence')?'Fora dos totais enquanto pausada.':'Contexto técnico combinado.'}</div>
            </div>
            <div data-sentinel-role="entry-status" data-sentinel-card="entry-status" style="padding:8px;border-radius:11px;background:${panelBg};border:1px ${isPaused('market_entry')?'dashed':'solid'} ${entryReady?tone:panelBorder};min-width:0;min-height:124px;height:auto;overflow:visible;box-shadow:${panelShadow};opacity:${isPaused('market_entry')?'.48':'1'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px"><span style="font-size:10px;font-weight:950;color:${ink}">PRONTIDÃO DE ENTRADA</span>${pauseBtn('market_entry')}</div>
              <div style="margin-top:4px;font-size:8px;font-weight:900;color:${entryReady?callTone:warnTone};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isPaused('market_entry')?'PAUSADA':esc(gateReason)}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px"><div style="padding:5px;border-radius:7px;background:rgba(114,230,185,.05);text-align:center"><span style="font-size:7px;color:${callTone};font-weight:900">CALL</span><b style="display:block;font-size:15.5px;color:${callTone}">${n(statusCall,0)}%</b></div><div style="padding:5px;border-radius:7px;background:rgba(255,143,157,.05);text-align:center"><span style="font-size:7px;color:${putTone};font-weight:900">PUT</span><b style="display:block;font-size:15.5px;color:${putTone}">${n(statusPut,0)}%</b></div></div>
              <div style="margin-top:5px;font-size:8px;color:${subtle}">${isPaused('market_entry')?'Fora dos totais enquanto pausada.':(entryReady?signal:'Aguardando confirmação.')}</div>
            </div>
            <div data-sentinel-role="reversal" data-sentinel-card="reversal" style="padding:8px;border-radius:11px;background:${panelBg};border:1px ${isPaused('market_reversal')?'dashed':'solid'} ${panelBorder};min-width:0;min-height:124px;height:auto;overflow:visible;box-shadow:${panelShadow};opacity:${isPaused('market_reversal')?'.48':'1'}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px"><span style="font-size:10px;font-weight:950;color:${ink}">VIRADA / REVERSÃO</span>${pauseBtn('market_reversal')}</div>
              <div style="margin-top:5px;font-size:15px;font-weight:950;color:${reversalSide==='CALL'?callTone:reversalSide==='PUT'?putTone:warnTone}">${isPaused('market_reversal')?'PAUSADA':(reversalStrength==null?'AGUARDAR':reversalSide)}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px"><div style="padding:5px;border-radius:7px;background:rgba(114,230,185,.05);text-align:center"><span style="font-size:7px;color:${callTone};font-weight:900">CALL</span><b style="display:block;font-size:15.5px;color:${callTone}">${n(reversalCall,0)}%</b></div><div style="padding:5px;border-radius:7px;background:rgba(255,143,157,.05);text-align:center"><span style="font-size:7px;color:${putTone};font-weight:900">PUT</span><b style="display:block;font-size:15.5px;color:${putTone}">${n(reversalPut,0)}%</b></div></div>
              <div style="margin-top:5px;font-size:8px;color:${subtle}">${isPaused('market_reversal')?'Fora dos totais enquanto pausada.':(reversalTimer!=null?'janela '+reversalTimer+'s':'leitura de reversão')}</div>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:9px;margin-bottom:6px">
            <div><div style="font-size:10px;font-weight:950;letter-spacing:.045em;color:${ink}">ANÁLISE DAS ESTRATÉGIAS</div><div style="font-size:7.8px;color:${subtle};margin-top:1px">3 estratégias independentes</div></div>
            <span style="font-size:7.8px;font-weight:900;color:${muted}">${strategyActiveCount}/3 ativas</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:start">${strategyCardsHtml}</div>

          <div style="margin-top:9px;padding:9px 10px;border-radius:12px;background:${uiTheme==='light'?'rgba(255,255,255,.72)':'rgba(255,255,255,.024)'};border:1px solid ${panelBorder}">
            <div style="font-size:10px;font-weight:900;color:${ink};margin-bottom:7px">Configuração</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px">
              <label><span style="display:block;font-size:8px;font-weight:800;color:${muted};margin:0 0 3px 2px">Estratégia 1</span><select data-sentinel-setting="strategy" style="width:100%;height:32px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:700"><option value="smart_confluence" ${strategy==='smart_confluence'?'selected':''}>Smart Confluence</option><option value="price_action" ${strategy==='price_action'?'selected':''}>Price Action</option><option value="trendline_breakout" ${strategy==='trendline_breakout'?'selected':''}>Trendline Breakout</option><option value="support_resistance" ${strategy==='support_resistance'?'selected':''}>Suporte / Resistência</option><option value="fibonacci_retest" ${strategy==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option><option value="trend" ${strategy==='trend'?'selected':''}>Trend Following</option><option value="mean_reversion" ${strategy==='mean_reversion'?'selected':''}>Mean Reversion</option><option value="breakout" ${strategy==='breakout'?'selected':''}>Breakout</option></select></label>
              <label><span style="display:block;font-size:8px;font-weight:800;color:${muted};margin:0 0 3px 2px">Estratégia 2</span><select data-sentinel-setting="strategy2" style="width:100%;height:32px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:700"><option value="none" ${strategy2==='none'?'selected':''}>Não selecionada</option><option value="smart_confluence" ${strategy2==='smart_confluence'?'selected':''}>Smart Confluence</option><option value="price_action" ${strategy2==='price_action'?'selected':''}>Price Action</option><option value="trendline_breakout" ${strategy2==='trendline_breakout'?'selected':''}>Trendline Breakout</option><option value="support_resistance" ${strategy2==='support_resistance'?'selected':''}>Suporte / Resistência</option><option value="fibonacci_retest" ${strategy2==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option><option value="trend" ${strategy2==='trend'?'selected':''}>Trend Following</option><option value="mean_reversion" ${strategy2==='mean_reversion'?'selected':''}>Mean Reversion</option><option value="breakout" ${strategy2==='breakout'?'selected':''}>Breakout</option></select></label>
              <label><span style="display:block;font-size:8px;font-weight:800;color:${muted};margin:0 0 3px 2px">Estratégia 3</span><select data-sentinel-setting="strategy3" style="width:100%;height:32px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:700"><option value="none" ${strategy3==='none'?'selected':''}>Não selecionada</option><option value="smart_confluence" ${strategy3==='smart_confluence'?'selected':''}>Smart Confluence</option><option value="price_action" ${strategy3==='price_action'?'selected':''}>Price Action</option><option value="trendline_breakout" ${strategy3==='trendline_breakout'?'selected':''}>Trendline Breakout</option><option value="support_resistance" ${strategy3==='support_resistance'?'selected':''}>Suporte / Resistência</option><option value="fibonacci_retest" ${strategy3==='fibonacci_retest'?'selected':''}>Fibonacci Retest</option><option value="trend" ${strategy3==='trend'?'selected':''}>Trend Following</option><option value="mean_reversion" ${strategy3==='mean_reversion'?'selected':''}>Mean Reversion</option><option value="breakout" ${strategy3==='breakout'?'selected':''}>Breakout</option></select></label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px">
              <label><span style="display:block;font-size:8px;font-weight:800;color:${muted};margin:0 0 3px 2px">Tempo / expiração</span><select data-sentinel-setting="duration" style="width:100%;height:32px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:750"><option value="30000" ${duration===30000?'selected':''}>30 s</option><option value="60000" ${duration===60000?'selected':''}>1 min</option><option value="120000" ${duration===120000?'selected':''}>2 min</option><option value="300000" ${duration===300000?'selected':''}>5 min</option><option value="600000" ${duration===600000?'selected':''}>10 min</option><option value="900000" ${duration===900000?'selected':''}>15 min</option></select></label>
              <label><span style="display:block;font-size:8px;font-weight:800;color:${muted};margin:0 0 3px 2px">Filtro · pontos</span><select data-sentinel-setting="minConfidence" title="Score mínimo de confluência. Não é probabilidade de acerto." style="width:100%;height:32px;background:${fieldBg};color:${fieldInk};border:1px solid ${fieldBorder};border-radius:8px;padding:0 7px;font-size:9px;font-weight:750"><option value="55" ${minConfidence===55?'selected':''}>55 pts</option><option value="60" ${minConfidence===60?'selected':''}>60 pts</option><option value="65" ${minConfidence===65?'selected':''}>65 pts</option><option value="70" ${minConfidence===70?'selected':''}>70 pts</option><option value="75" ${minConfidence===75?'selected':''}>75 pts</option><option value="80" ${minConfidence===80?'selected':''}>80 pts</option><option value="85" ${minConfidence===85?'selected':''}>85 pts</option><option value="90" ${minConfidence===90?'selected':''}>90 pts</option><option value="95" ${minConfidence===95?'selected':''}>95 pts</option></select></label>
            </div>
            <div style="margin-top:6px;font-size:7.5px;color:${subtle}">Os 3 cards superiores de força da vela foram mantidos. As estratégias abaixo são calculadas separadamente.</div>
          </div>

          <div style="margin-top:7px">
            <button data-sentinel-toggle="details" style="width:100%;border:0;background:transparent;color:${muted};padding:6px 2px;display:flex;justify-content:space-between;cursor:pointer;font-size:8.5px;font-weight:800"><span>Detalhes técnicos</span><span data-sentinel-arrow>${detailsOpen?'⌃':'⌄'}</span></button>
            <div data-sentinel-section="details" style="display:${detailsOpen?'block':'none'};padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.022);font-size:9px;color:${ink}"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px 7px"><div>CALL score <b>${n(buy,0)} pts</b></div><div>PUT score <b>${n(sell,0)} pts</b></div><div>Diferença <b>${n(q.technicalEdge,0)} pts</b></div><div>EMA9 <b>${n(m.fast,5)}</b></div><div>EMA21 <b>${n(m.slow,5)}</b></div><div>RSI <b>${n(m.rsi,1)}</b></div><div>MACD <b>${n(m.macd?.histogram,5)}</b></div><div>ESTOC <b>${n(m.stoch,1)}</b></div><div>ATR <b>${n(m.atr,5)}</b></div></div><div style="margin-top:5px;color:${muted}">${reasons}</div></div>
          </div>

          <div style="height:12px;position:relative"><span style="position:absolute;right:-7px;bottom:-9px;color:${subtle};font-size:18px;pointer-events:none">◢</span></div>

        `;

        // Keep live refreshes from producing a one-frame scroll/layout jump.
        el.scrollTop=stableScrollTop;
        el.style.overflowY='auto';
        const collapsedNow=new Set(collapsedSummaries);
        el.querySelectorAll('[data-sentinel-summary]').forEach(card=>{
          const key=card.getAttribute('data-sentinel-summary')||'';
          const collapseButton=card.querySelector(':scope > [data-sentinel-summary-collapse]');
          if(!collapseButton)return;
          const collapsed=collapsedNow.has(key);
          [...card.children].forEach((child,index)=>{
            const isCollapseButton=child===collapseButton;
            if(index===0||isCollapseButton)child.style.display='';
            else child.style.display=collapsed?'none':'';
          });
          card.dataset.collapsed=collapsed?'1':'0';
        });

        requestAnimationFrame(()=>{
          // Live analysis must never move the panel or reset the user's scroll.
          if(stableLeft)el.style.left=stableLeft;
          if(stableTop)el.style.top=stableTop;
          el.style.right=stableRight||el.style.right;
          const maxScroll=Math.max(0,el.scrollHeight-el.clientHeight);
          el.scrollTop=Math.max(0,Math.min(maxScroll,stableScrollTop));
          if(el.dataset.geometryClamped!=='1'){
            el.dataset.geometryClamped='1';
            const r=el.getBoundingClientRect();
            if(r.width>window.innerWidth-16)el.style.width=Math.max(450,window.innerWidth-16)+'px';
            if(r.height>window.innerHeight-16)el.style.height=Math.max(320,window.innerHeight-16)+'px';
            const rr=el.getBoundingClientRect();
            if(rr.right>window.innerWidth-8){el.style.left=Math.max(8,window.innerWidth-rr.width-8)+'px';el.style.right='auto'}
            if(rr.bottom>window.innerHeight-8)el.style.top=Math.max(8,window.innerHeight-rr.height-8)+'px';
            if(rr.top<8)el.style.top='8px'
          }
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
    if(action==='resume-visible'){await this.launchNormal(provider,{manual:true});return{opened:true,resumed:true,label:cfg.label,...await this.sessionInfo(provider)}}
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
