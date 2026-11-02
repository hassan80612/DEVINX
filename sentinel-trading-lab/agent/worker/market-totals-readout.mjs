// Presentation only: patch market readings and the analyst interpretation. No analysis,
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
 if(!matches(panel))return;
 // Share the existing one-second text update. Only interpretation fields
 // cross this path; entry receipts and trade permissions remain untouched.
 const observation=frame.observation,prior=window.__sentinelObservationReadout;
 if(observation&&Number(observation.evaluatedAt)>0&&Number(observation.evaluatedAt)<=frame.at&&
   (!prior||!matches({dataset:prior.context})||Number(prior.observation.evaluatedAt)<=Number(observation.evaluatedAt)))
  window.__sentinelObservationReadout={context:{...panel.dataset},observation};
 const applyObservation=()=>{
  const saved=window.__sentinelObservationReadout,data=window.__sentinelLastOverlayData,
   p=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot?.querySelector('[data-sentinel-vnext-cards]');
  if(!saved||!matches(p)||!matches({dataset:saved.context})||data?.vnext?.mode!=='now'||
    data.engine!==frame.engine||Number(data.durationMs)!==frame.durationMs||data.state!==frame.state||
    key(data.validatedAsset||data.asset)!==key(frame.asset)||data.quoteProvider!==frame.provider)return;
  const old=data.vnext.nowObservation;
  if(!old||Number(old.evaluatedAt||0)>Number(saved.observation.evaluatedAt))return;
  for(const k of ['marketReading','marketPhase','marketPhaseLabel','marketTrendSide','observedAt','quoteAt','evaluatedAt']){
   const value=saved.observation[k];
   if(value==null||typeof value==='string'||typeof value==='number')old[k]=value;
  }
  const root=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
  root?.getElementById?.('sentinel-trading-overlay')?.__sentinelTargetClockTick?.();
 };
 applyObservation();
 if(Number(panel.dataset.readingsAt)>frame.at)return;
 const old=window.__sentinelMarketTotalsReadout;
 if(old&&old.provider===frame.provider&&key(old.asset)===key(frame.asset)&&old.engine===frame.engine&&
  old.durationMs===frame.durationMs&&old.language===frame.language&&old.at>frame.at)return;
 window.__sentinelMarketTotalsReadout=frame;
 window.__sentinelApplyMarketTotals=()=>{
  const current=window.__sentinelMarketTotalsReadout;
  applyObservation();
  // Reapply the cached frame through the same context/order checks after a
  // full render, so an older scheduled card cannot roll these totals back.
  if(current!==frame)return;
  const p=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot?.querySelector('[data-sentinel-vnext-cards]');
  if(!matches(p)||Number(p.dataset.readingsAt)>frame.at)return;
  const quoteAge=Date.now()-Number(frame.quoteAt);
  const fresh=frame.fresh===true&&frame.state==='running'&&Number(frame.quoteAt)>0&&quoteAge>=-2500&&quoteAge<3500;
  const contextKey=[frame.provider,key(frame.asset),frame.engine,frame.durationMs,frame.language,frame.state].join('|');
  const known=id=>frame.cards.find(c=>c?.id===id);
  const valid=c=>c?.callPct!=null&&c?.putPct!=null&&
   Number.isFinite(Number(c.callPct))&&Number.isFinite(Number(c.putPct));
  // The three percentages are PRESENTATION only. Do not replace valid
  // readings with dashes during one missing/throttled broker packet.
  // Never carry values across provider, asset, horizon, strategy or state.
  const allValid=ids.every(id=>valid(known(id)));
  const host=root?.getElementById?.('sentinel-trading-overlay');
  if(fresh&&allValid){
   window.__sentinelLastConfirmedMarketTotals={contextKey,at:Date.now(),
    cards:ids.map(id=>({...known(id)}))};
   if(host)host.__sentinelMarketTotalsCache={
    key:[frame.provider,String(frame.asset||'').trim().toUpperCase(),frame.engine,frame.durationMs].join('|'),
    at:Date.now(),cards:ids.map(id=>({...known(id)}))};
  }
  const saved=window.__sentinelLastConfirmedMarketTotals;
  const historical=!fresh||!allValid;
  const retained=historical&&saved?.contextKey===contextKey&&
   Date.now()-Number(saved.at)<=30000?saved.cards:null;
  for(const id of ids){
   const liveCard=known(id),card=retained?.find(c=>c.id===id)||liveCard;
   const node=p.querySelector('[data-sentinel-summary="'+id+'"]');
   const side=node?.querySelector('[data-sentinel-reading-side]');
   const call=node?.querySelector('[data-sentinel-reading-call]'),put=node?.querySelector('[data-sentinel-reading-put]');
   if(!side||!call||!put)continue;
   const available=valid(card)&&((fresh&&allValid)||!!retained);
   const old=!!retained;
   const direction=available&&['CALL','PUT','NEUTRO'].includes(card.side)?card.side:'AGUARDAR';
   const set=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
   const directionLabel=direction==='AGUARDAR'?frame.waitLabel:
    direction==='NEUTRO'?frame.neutralLabel:direction;
   set(side,old?'ÚLTIMA LEITURA · '+directionLabel:directionLabel);
   set(call,'CALL '+(available?Math.round(Number(card.callPct))+'%':'—'));
   set(put,'PUT '+(available?Math.round(Number(card.putPct))+'%':'—'));
   const color=old?p.dataset.neutralColor:
    available&&Number(card.callPct)>Number(card.putPct)?call.style.color:
    available&&Number(card.putPct)>Number(card.callPct)?put.style.color:p.dataset.neutralColor;
   if(side.style.color!==color)side.style.color=color;
   if(node)node.dataset.historyOnly=old?'true':'false';
  }
  p.dataset.readingsAt=String(frame.at);
 };
 window.__sentinelApplyMarketTotals();
}
