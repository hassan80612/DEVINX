// Called only at bot arming / physical order dispatch inside the EXISTING broker tab.
// No timers, network requests, clicks, browser focus changes or page-wide scans.
// The visible trade-size input is broker-owned and can change at any time.
export function readBrokerTradeStake(){
 const parse=raw=>{
  let s=String(raw??'').trim().replace(/[\s\u00a0]/g,'').replace(/^(?:R\$|US\$|\$|€|£)/,'');
  if(!s||!/^[0-9][0-9.,]*$/.test(s))return null;
  const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
  if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  else if(comma>=0)s=s.replace(',','.');
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<=1000000?Math.round(n*1e6)/1e6:null;
 };
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);
   return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&
     !el.closest('#sentinel-trading-overlay-host,[inert],[aria-hidden="true"]');};
 const tag=el=>[el.name,el.id,el.getAttribute('data-test'),el.getAttribute('data-testid'),
   el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.closest('label')?.textContent,
   el.parentElement?.getAttribute('data-test'),el.parentElement?.getAttribute('data-testid')]
   .filter(Boolean).join(' ').toLowerCase();
 const relevant=/\b(amount|investment|investimento|invest|stake|trade.?size|valor|importe|montant|quantia|sum.?value|deal.?amount|bet.?amount)\b/i;
 const wrong=/(balance|saldo|payout|lucro|profit|bonus|bonus|leverag|retorno|rentabilidade|withdraw|deposit)/i;
 const values=[];
 for(const el of document.querySelectorAll('input:not([type="hidden"]):not([type="password"]),[role="spinbutton"]')){
  if(!visible(el))continue;
  const metadata=tag(el);
  if(!relevant.test(metadata)||wrong.test(metadata))continue;
  const value=parse(el.value??el.getAttribute('aria-valuenow')??el.textContent);
  if(value!=null)values.push(value);
 }
 // Some broker skins use a non-input, explicitly named numeric trade-size badge.
 if(!values.length)for(const el of document.querySelectorAll('[data-testid*="amount" i],[data-test*="amount" i],[aria-label*="investment" i]')){
  if(!visible(el)||wrong.test(tag(el)))continue;
  if(el.querySelector('input,[role="spinbutton"]'))continue;
  const amount=parse(el.textContent);
  if(amount!=null)values.push(amount);
 }
 // IQ Option / Exnova can render Invest as a custom display with their
 // own calculator instead of an HTML input. Only inspect small, explicitly
 // labelled Invest widgets; never mistake coefficient, balance or quick picks.
 if(!values.length){
  const scopes=document.querySelectorAll('[data-test*="invest" i],[data-testid*="invest" i],[aria-label*="invest" i],[class*="invest" i]');
  for(const root of [...scopes].slice(0,35)){
   if(!visible(root))continue;
   const rect=root.getBoundingClientRect();
   if(rect.width>290||rect.height>135)continue;
   const label=[root.getAttribute('aria-label'),root.getAttribute('data-test'),
     root.getAttribute('data-testid'),root.className,root.textContent]
     .filter(x=>typeof x==='string').join(' ').toLowerCase();
   if(!/\binvest(?:ment|imento)?\b/.test(label)||wrong.test(label))continue;
   const leaves=[root,...root.querySelectorAll('input,[role="spinbutton"],[contenteditable],span,strong,b')];
   const detected=[];
   for(const leaf of [...leaves].slice(0,30)){
    if(!visible(leaf))continue;
    const raw=String(leaf.value??leaf.textContent??'').trim();
    if(raw.length>30)continue;
    const value=parse(raw);
    if(value!=null)detected.push(value);
   }
   if([...new Set(detected)].length===1)values.push(detected[0]);
  }
 }
 const distinct=[...new Set(values)];
 return distinct.length===1?distinct[0]:null;
}

// One bounded recovery attempt after the broker replaces its Invest widget
// on DEMO/REAL account changes. This selects ONLY a uniquely identified,
// visible, broker-owned investment field: never a CALL/PUT or trade button.
// The caller performs at most one Playwright click and re-reads the amount.
export function locateBrokerInvestRecovery(){
 const visible=el=>{
  if(!el?.getBoundingClientRect||el.closest?.('#sentinel-trading-overlay-host,[inert],[aria-hidden="true"]'))return false;
  const r=el.getBoundingClientRect(),style=getComputedStyle(el);
  return r.width>=24&&r.height>=13&&r.width<=290&&r.height<=145&&
   style.display!=='none'&&style.visibility!=='hidden'&&
   !el.disabled&&el.getAttribute?.('aria-disabled')!=='true';
 };
 const excludes=/\b(?:call|put|buy|sell|comprar|vender|trade now|negociar|confirm|accept|deposit|depositar|retirar|withdraw|saldo|balance|payout|profit|lucro|multiplicar|multiply|divide|dividir)\b/i;
 const invest=/\binvest(?:imento|ment)?\b/i;
 const selectors='input,[role="spinbutton"],[data-testid*="invest" i],[data-test*="invest" i],[aria-label*="invest" i]';
 const matches=[];
 for(const el of [...document.querySelectorAll(selectors)].slice(0,100)){
  if(!visible(el))continue;
  const label=[el.getAttribute?.('aria-label'),el.getAttribute?.('title'),
   el.getAttribute?.('data-testid'),el.getAttribute?.('data-test'),
   el.getAttribute?.('placeholder'),el.getAttribute?.('name'),el.closest?.('label')?.textContent,
   String(el.className||'')].filter(Boolean).join(' ');
  if(!invest.test(label)||excludes.test(label))continue;
  if(el.closest?.('button[aria-label*="call" i],button[aria-label*="put" i],[data-test*="buy" i],[data-test*="sell" i]'))continue;
  const target=el.matches?.('input,[role="spinbutton"],button,[role="button"]')?el:
   el.querySelector?.('input,[role="spinbutton"]')||el;
  if(!visible(target))continue;
  if(target.querySelector?.('button,[role="button"]')&&target!==el)continue;
  matches.push(target);
 }
 const unique=[...new Set(matches)];
 if(unique.length!==1)return{ready:false,reason:unique.length?'ambiguous':'not-found'};
 const target=unique[0];
 // A temporary attribute only identifies the exact element for one browser
 // click; it is NOT an order selector and does not change the Invest value.
 target.setAttribute('data-sentinel-invest-recovery','1');
 return{ready:true,selector:'[data-sentinel-invest-recovery="1"]'};
}
