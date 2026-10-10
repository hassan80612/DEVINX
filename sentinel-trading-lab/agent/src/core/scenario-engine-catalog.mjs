/**
 * Sentinel VNext — independent main-scenario engine selection.
 *
 * A selection is NOT a weighted vote. One selected engine owns one
 * prospective scenario. All engines may receive the SAME validated, read-only
 * market snapshot, but must not read predictions from other engines.
 * Existing 13.4.58 runtime is unchanged until the VNext integration is
 * deliberately enabled and forward-tested.
 */
export const SCENARIO_ENGINES=Object.freeze([
  {id:'automatic',name:'Automático Sentinel',family:'native',description:'Previsão própria de preço e estrutura, sem usar nenhuma estratégia selecionável',research:'market-regime+forward-microstructure'},
  {id:'price_action',name:'Price Action',family:'price-action',description:'Estrutura, impulsos, rejeições e sequências de preço fechadas',research:'market-structure+conditional-price-action'},
  {id:'support_resistance',name:'Suporte e Resistência',family:'levels',description:'Reação, rejeição e rompimento em zonas estruturais anteriores',research:'historical-level-reaction'},
  {id:'trend',name:'Trend Following',family:'trend',description:'Persistência, continuidade e perda de aceleração da tendência',research:'trend-persistence+regime'},
  {id:'mean_reversion',name:'Mean Reversion',family:'reversion',description:'Distância da média e regime de reversão estatística',research:'mean-reversion+volatility'},
  {id:'breakout',name:'Breakout',family:'breakout',description:'Compressão, possível expansão e falhas de rompimento',research:'volatility-compression+range'},
  {id:'trendline_breakout',name:'Trendline Breakout',family:'trendline',description:'Linhas de pivôs já confirmados e projeção de quebra',research:'swing-trendline-forecast'},
  {id:'fibonacci_retest',name:'Fibonacci Retest',family:'retracement',description:'Pernas estruturais e regiões de retração, não a vela atual',research:'prior-swing-retracement'},
  {id:'smart_confluence',name:'Smart Confluence',family:'native-confluence',description:'Leitura técnica própria multievidência, sem votação de outros motores',research:'single-engine-evidence-fusion'}
].map(o=>Object.freeze(o)));
const BY_ID=new Map(SCENARIO_ENGINES.map(engine=>[engine.id,engine]));
export function selectedScenarioEngine(settings={}){
  const value=String(settings.engine||settings.strategy||'automatic').toLowerCase();
  return BY_ID.get(value)||BY_ID.get('automatic');
}
export function oneEngineSelection(settings={}){
  const engine=selectedScenarioEngine(settings);
  return {engine:engine.id,strategy:engine.id,strategy2:'none',strategy3:'none'};
}
export function scenarioEngineContext(settings={},provider='',asset='',durationMs=0,horizonSeconds=0){
  const engine=selectedScenarioEngine(settings);
  return ['main-forecast-vnext',provider,asset,engine.id,Math.round(Number(durationMs)||0),Math.round(Number(horizonSeconds)||0)].join('|');
}
