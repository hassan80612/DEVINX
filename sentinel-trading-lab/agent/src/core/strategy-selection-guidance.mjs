// Strategy selection is the user's authority. Suggestions are structural
// diversification guidance, NOT historical accuracy or win-rate claims.
export const STRATEGY_LABELS=Object.freeze({
  smart_confluence:'Smart Confluence',price_action:'Price Action',
  trendline_breakout:'Trendline Breakout',support_resistance:'Suporte / Resistência',
  fibonacci_retest:'Fibonacci Retest',trend:'Trend Following',
  mean_reversion:'Mean Reversion',breakout:'Breakout'
});
export const STRATEGY_FAMILIES=Object.freeze({
  smart_confluence:'aggregate',price_action:'price_action',
  trendline_breakout:'breakout',breakout:'breakout',
  trend:'trend',support_resistance:'location',
  fibonacci_retest:'location',mean_reversion:'location'
});
const name=id=>STRATEGY_LABELS[id]||String(id);
const validSide=s=>['CALL','PUT'].includes(String(s||'').toUpperCase())?String(s).toUpperCase():null;

/**
 * @param {{ids?:string[],paused?:Record<string,boolean>,cards?:Array<{slot?:number,side?:string,evidence?:number,paused?:boolean}>}} [options]
 */
export function strategySelectionGuidance({ids=[],paused={},cards=[]}={}){
  const selected=ids.map((id,i)=>({id:String(id||'none'),slot:i+1}))
    .filter(x=>x.id!=='none'&&STRATEGY_LABELS[x.id]&&paused['strategy_'+x.slot]!==true);
  const unique=[...new Set(selected.map(x=>x.id))];
  const families=unique.map(x=>STRATEGY_FAMILIES[x]);
  const duplicates=selected.length!==unique.length;
  const overlapping=unique.some((id,i)=>families[i]!=='aggregate'&&families.indexOf(families[i])!==i);
  const aggregateMixed=unique.length>1&&unique.includes('smart_confluence');
  const current=selected.map(x=>({id:x.id,card:cards.find(c=>Number(c.slot)===x.slot)}));
  const directional=current.filter(x=>x.card&&!x.card.paused&&validSide(x.card.side)&&Number(x.card.evidence)>=.35);
  const sides=[...new Set(directional.map(x=>validSide(x.card.side)))];
  const divergence=sides.length>1;
  const count=selected.length;
  let level='complementary',message='';
  if(count===0){level='idle';message='Selecione 1 a 3 estratégias para a análise.'}
  else if(duplicates){level='overlap';message='Estratégia repetida: use somente uma vez; não multiplica evidências.'}
  else if(divergence){level='conflict';message='CALL e PUT divergentes: evite combinar agora; teste separadas.'}
  else if(overlapping){level='overlap';message='Estratégias de mesma família; prefira combinar com Price Action ou Trend.'}
  else if(aggregateMixed){level='overlap';message='Smart Confluence já agrega sinais: prefira usá-la sozinha ou com peso reduzido.'}
  else if(count===1){level='single';message=name(unique[0])+' selecionada: sinal deve respeitar esta estratégia.'}
  else{message=count+' estratégias complementares; entradas exigem preço confirmado.'}
  return{level,message,selectedCount:count,distinctCount:unique.length,overlap:duplicates||overlapping||aggregateMixed,divergence,
    recommendation:'Sugestão: Price Action + Suporte/Resistência + Trend Following (validar em DEMO).',
    selected:unique,independentFamilies:new Set(families.filter(f=>f!=='aggregate')).size,
    provenAccuracy:false};
}

/**
 * An explicitly selected signal is authoritative about its own direction,
 * but cannot synthesize an entry. Actual fresh price, structure and user
 * technical thresholds must still qualify separately.
 * When multiple ACTIVE chosen strategies disagree, neither side is allowed.
 * Ignore low-evidence directional noise until the selected strategy qualifies.
 */
export function chosenStrategiesPermit({cards=[],side,minimumEvidence=.35}={}){
  if(!Array.isArray(cards)||cards.length===0)
    return {allowed:true,status:'not-evaluated',reason:null}; // legacy/offline analysis fixtures
  const active=cards.filter(c=>c?.active===true&&c.paused!==true);
  if(!active.length)return {allowed:false,status:'none-active',reason:'Nenhuma estratégia ativa para autorizar direção.'};
  const seen=new Set();
  const meaningful=active.filter(c=>{
    if(seen.has(c.strategy))return false;
    seen.add(c.strategy);
    return validSide(c.side)&&Number(c.evidence)>=minimumEvidence;
  });
  if(!meaningful.length)return {allowed:false,status:'awaiting-strategy',reason:'Estratégia selecionada sem direção confirmada.'};
  const calls=meaningful.some(c=>validSide(c.side)==='CALL');
  const puts=meaningful.some(c=>validSide(c.side)==='PUT');
  if(calls&&puts)return {allowed:false,status:'conflict',reason:'Estratégias escolhidas divergem em CALL/PUT. Aguarde ou teste separadas.'};
  const approved=calls?'CALL':'PUT';
  return {allowed:approved===String(side||'').toUpperCase(),status:approved===String(side||'').toUpperCase()?'aligned':'opposed',
    approvedSide:approved,reason:approved===String(side||'').toUpperCase()?null:'Sinal '+String(side||'')+' contrário à estratégia escolhida ('+approved+').'};
}
