// Chosen strategies supply INDEPENDENT evidence when selecting between
// otherwise valid real-price entry candidates. They do not synthesize an
// execution signal, change the technical score or veto fresh breakout data.
// The subanalyst has no input here.
export function rankByChosenStrategies(candidates,confluence,durationSeconds){
  const row=confluence?.horizons?.[String(Math.round(durationSeconds))]||null;
  const count=Number(row?.activeCount||0),call=Number(row?.callPct),put=Number(row?.putPct);
  const evidence=Number(row?.evidence||0);
  if(!(count>0&&Number.isFinite(call)&&Number.isFinite(put)&&Number.isFinite(evidence)&&call>=0&&put>=0&&call+put>0)){
    return candidates.map(c=>({...c,rankingScore:Number(c.score)||0,chosenStrategyBias:'NEUTRO',strategyEvidence:0}));
  }
  // Only the RELATIVE ranking changes, by an explicit bounded contribution
  // from the selected strategies' own evidence. No new entry gate is added.
  const normalized=call/(call+put),weighted=Math.max(0,Math.min(1,evidence/100));
  return candidates.map(c=>{
    const sideSupport=c.side==='CALL'?normalized:1-normalized;
    const contribution=(sideSupport-.5)*20*weighted;
    return {...c,rankingScore:(Number(c.score)||0)+contribution,
      chosenStrategyBias:normalized>.54?'CALL':normalized<.46?'PUT':'NEUTRO',
      strategyEvidence:Math.round(sideSupport*1000)/10};
  });
}
