// Browser presentation only. Consumes an already received quote, no broker I/O.
export function patchCurrentQuote(frame){
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 if(!positive(frame?.price)||!positive(frame?.quoteAt)||!frame.provider||!frame.asset)return;
 const key=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 const old=window.__sentinelCurrentQuoteReadout;
 if(old&&old.provider===frame.provider&&key(old.asset)===key(frame.asset)&&old.quoteAt>frame.quoteAt)return;
 window.__sentinelCurrentQuoteReadout=frame;
 window.__sentinelApplyCurrentQuote=()=>{
  const current=window.__sentinelCurrentQuoteReadout;
  const root=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
  const node=root?.querySelector('[data-sentinel-current-quote]');
  if(!node||node.dataset.provider!==current.provider||key(node.dataset.asset)!==key(current.asset)||
    Number(node.dataset.quoteAt)>current.quoteAt)return;
  node.textContent=current.price.toFixed(current.price>=100?3:current.price>=10?4:5);
  node.dataset.quoteAt=String(current.quoteAt);
 };
 window.__sentinelApplyCurrentQuote();
}
