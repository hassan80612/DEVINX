// Browser-only visual model of the confirmed Windows Agent opportunity.
// Never run an independent forecast, roll over a stale interval, or extend
// a CALL/PUT after the Agent's 1.5-second confirmed-entry indication.
export function pcAuthoritativeWindow({
  windowStartedAt=0,windowEndsAt=0,phase=null,side=null,
  entryTriggeredAt=0,quoteAt=0,now=Date.now()
}={}){
  const start=Number(windowStartedAt),end=Number(windowEndsAt),time=Number(now);
  const valid=Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(time)&&
    start>0&&end>start&&end-start>=5000&&end-start<=3600000&&time>=start;
  const withinDeadline=valid&&time<end;
  const direction=['CALL','PUT'].includes(String(side||''))?String(side):null;
  const tick=Number(quoteAt),triggered=Number(entryTriggeredAt);
  // Mirrors the PC overlay's 1500ms gate and broker-quote recency.
  // Signaling is impossible before the PC reports a confirmed trigger.
  const enterNow=valid&&phase==='fired'&&!!direction&&tick>0&&
    time>=tick&&time-tick<3500&&triggered>0&&
    time>=triggered&&time<=triggered+1500;
  const active=withinDeadline||enterNow;
  const remainingSeconds=active?Math.max(1,Math.ceil((end-time)/1000)):null;
  let label;
  if(enterNow)label='ENTRADA AGORA · '+(direction==='CALL'?'↑ CALL':'↓ PUT');
  else if(!valid)label='';
  else if(phase==='cancelled')label='JANELA SEM ENTRADA';
  else if(phase==='fired')label='ENTRADA JÁ SINALIZADA'+(direction?' · '+(direction==='CALL'?'↑ CALL':'↓ PUT'):'');
  else if(!withinDeadline)label='';
  else if(phase==='open'&&direction)label=(direction==='CALL'?'↑ CALL':'↓ PUT')+' · JANELA ABERTA';
  else label='JANELA ABERTA · ANALISANDO';
  return {active,enterNow,withinDeadline,remainingSeconds,label,phase,startedAt:start,deadline:end};
}
