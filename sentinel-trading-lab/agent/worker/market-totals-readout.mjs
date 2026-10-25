// Presentation only: patch the existing nine text fields. No analysis,
// trading permission, broker reads, DOM reconstruction, or catch-up queue.
export function patchMarketTotals(frame){
 const ids=['market-now','prior-structure','total-of-totals'];
 const key=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(!frame?.provider||!frame.asset||!frame.engine||!(frame.durationMs>0)||
   !Number.isFinite(frame.at)||frame.at<=0||!Array.isArray(frame.cards))return;
 const root=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
 const panel=root?.querySelector('[data-sentinel-vnext-cards]');
 const matches=p=>p&&p.dataset.provider===frame.provider&&key(p.dataset.asset)===key(frame.asset)&&
  p.dataset.engine===frame.engine&&Number(p.dataset.duration)===frame.durationMs&&p.dataset.language===frame.language&&p.dataset.state===frame.state;
 if(!matches(panel)||Number(panel.dataset.readingsAt)>frame.at)return;
 const old=window.__sentinelMarketTotalsReadout;
 if(old&&old.provider===frame.provider&&key(old.asset)===key(frame.asset)&&old.engine===frame.engine&&
  old.durationMs===frame.durationMs&&old.language===frame.language&&old.at>frame.at)return;
 window.__sentinelMarketTotalsReadout=frame;
 window.__sentinelApplyMarketTotals=()=>{
  const current=window.__sentinelMarketTotalsReadout;
  // Reapply the cached frame through the same context/order checks after a
  // full render, so an older scheduled card cannot roll these totals back.
  if(current!==frame)return;
  const p=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot?.querySelector('[data-sentinel-vnext-cards]');
  if(!matches(p)||Number(p.dataset.readingsAt)>frame.at)return;
  const quoteAge=Date.now()-Number(frame.quoteAt);
  const fresh=frame.fresh===true&&frame.state==='running'&&Number(frame.quoteAt)>0&&quoteAge>=-2500&&quoteAge<3500;
  for(const id of ids){
   const card=frame.cards.find(c=>c?.id===id),node=p.querySelector('[data-sentinel-summary="'+id+'"]');
   const side=node?.querySelector('[data-sentinel-reading-side]');
   const call=node?.querySelector('[data-sentinel-reading-call]'),put=node?.querySelector('[data-sentinel-reading-put]');
   if(!side||!call||!put)continue;
   const available=fresh&&card?.callPct!=null&&card?.putPct!=null&&
    Number.isFinite(Number(card.callPct))&&Number.isFinite(Number(card.putPct));
   const direction=available&&['CALL','PUT','NEUTRO'].includes(card.side)?card.side:'AGUARDAR';
   const set=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
   set(side,direction==='AGUARDAR'?frame.waitLabel:direction==='NEUTRO'?frame.neutralLabel:direction);
   set(call,'CALL '+(available?Math.round(Number(card.callPct))+'%':'—'));
   set(put,'PUT '+(available?Math.round(Number(card.putPct))+'%':'—'));
   const color=available&&Number(card.callPct)>Number(card.putPct)?call.style.color:
    available&&Number(card.putPct)>Number(card.callPct)?put.style.color:p.dataset.neutralColor;
   if(side.style.color!==color)side.style.color=color;
  }
  p.dataset.readingsAt=String(frame.at);
 };
 window.__sentinelApplyMarketTotals();
}
