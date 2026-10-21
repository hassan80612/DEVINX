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
   if(!/\\binvest(?:ment|imento)?\\b/.test(label)||wrong.test(label))continue;
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
