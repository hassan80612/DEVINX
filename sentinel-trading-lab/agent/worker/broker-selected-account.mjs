// A monetary value is usable only after identifying the CURRENT broker account.
// Never pick the first real/demo row or treat Invest / P&L as account balance.
export function selectedAccountRow(rows,selection={}){
 const eligible=(rows||[]).filter(r=>[1,4].includes(Number(r.type)));
 if(selection.accountId!=null)return eligible.find(r=>String(r.id)===String(selection.accountId))??null;
 const mode=selection.mode==='real'?1:selection.mode==='demo'?4:null;
 const scoped=mode?eligible.filter(r=>Number(r.type)===mode):eligible;
 if(typeof selection.amount==='number'&&Number.isFinite(selection.amount)){
  const matches=scoped.filter(r=>Math.abs(Number(r.amount??r.balance)-selection.amount)<.005);
  return matches.length===1?matches[0]:null;
 }
 return scoped.length===1?scoped[0]:null;
}
// Self-contained browser read, restricted to visible account/balance controls
// in the top bar. No body.innerText, account-menu clicks, chart or OCR.
export function readSelectedBrokerAccount(){
 const candidates=[];
 const selectors='[data-test*="balance" i],[data-testid*="balance" i],[data-test*="current-account" i],[data-testid*="current-account" i],.usermenu__balance,.usermenu__info-balance,[class*="balance"]';
 const parse=text=>{
  const matches=String(text||'').replace(/\u00a0/g,' ').match(/[-+]?\d[\d\s.,]*/g)||[];
  if(matches.length!==1)return null;
  let s=matches[0].trim().replace(/\s/g,'');
  const dot=s.lastIndexOf('.'),comma=s.lastIndexOf(','),sep=Math.max(dot,comma);
  if(sep>=0){
   const decimal=s.length-sep-1===2;
   s=decimal?s.slice(0,sep).replace(/[.,]/g,'')+'.'+s.slice(sep+1):s.replace(/[.,]/g,'');
  }
  const n=Number(s);return Number.isFinite(n)&&n>=0?n:null;
 };
 for(const el of [...document.querySelectorAll(selectors)].slice(0,100)){
  if(el.closest('#sentinel-trading-overlay-host,[role="menu"],[role="listbox"],[aria-hidden="true"]'))continue;
  const box=el.getBoundingClientRect(),style=getComputedStyle(el);
  if(box.top<0||box.top>180||box.width<=0||box.height<=0||box.height>100||box.width>480||style.visibility==='hidden'||style.display==='none')continue;
  const text=String(el.textContent||'').trim();
  if(text.length>100||/invest|profit|payout|expected|lucro|resultado|dep[oó]sito|b[oô]nus|bonus|portfolio|carteira/i.test(text))continue;
  const amount=parse(text);if(amount==null)continue;
  const host=el.closest('[data-balance-id],[data-account-id]');
  const accountId=host?.getAttribute('data-balance-id')??host?.getAttribute('data-account-id')??null;
  const label=[text,el.getAttribute('aria-label'),el.getAttribute('title'),el.parentElement?.getAttribute('aria-label')].filter(Boolean).join(' ');
  const real=/conta real|real account|live account/i.test(label),demo=/pr[aá]tica|practice|demo/i.test(label);
  candidates.push({amount,accountId,mode:real!==demo?(real?'real':'demo'):null});
 }
 const unique=[...new Map(candidates.map(c=>[JSON.stringify(c),c])).values()];
 return unique.length===1?unique[0]:null;
}
