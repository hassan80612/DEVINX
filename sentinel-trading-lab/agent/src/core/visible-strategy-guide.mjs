// CURATED USER CHOICES. These are contexts for one authoritative market
// analysis base; hidden legacy IDs remain available internally for older data.
// Text is PT-first, translated by the existing PT/EN shared UI catalog.
export const VISIBLE_STRATEGIES=Object.freeze([
 {id:'automatic',name:'Automático Sentinel',when:'Quando usar: se não souber qual contexto escolher; o motor-base identifica o cenário e adapta a leitura.',short:'Detecta o contexto do gráfico'},
 {id:'fibonacci_retest',name:'Fibonacci Retest',when:'Quando usar: em retrações após um impulso claro, com regiões anteriores de Fibonacci.',short:'Retrações após impulso'},
 {id:'trend',name:'Trend Following',when:'Quando usar: em tendência consistente de alta ou baixa, com continuidade visível.',short:'Tendências definidas'},
 {id:'support_resistance',name:'Suporte e Resistência',when:'Quando usar: perto de suportes ou resistências já observados, incluindo testes e rejeições.',short:'Toques e rejeições em níveis'},
 {id:'smart_confluence',name:'Smart Confluence',when:'Quando usar: quando houver sinais técnicos mistos e for útil reunir diferentes evidências.',short:'Confluência de leituras'}
].map(x=>Object.freeze(x)));
export const VISIBLE_IDS=Object.freeze(VISIBLE_STRATEGIES.map(x=>x.id));
export const TECHNICAL_STRATEGY_IDS=Object.freeze(VISIBLE_IDS.filter(x=>x!=='automatic'));
export const STRATEGY_USE_BY_ID=Object.freeze(Object.fromEntries(VISIBLE_STRATEGIES.map(x=>[x.id,x])));
export const isVisibleStrategy=id=>VISIBLE_IDS.includes(String(id));
export const normalizeUserStrategy=id=>isVisibleStrategy(id)?String(id):'automatic';
export const normalizeTechnicalStrategy=id=>TECHNICAL_STRATEGY_IDS.includes(String(id))?String(id):null;
