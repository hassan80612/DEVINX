// Commercial strategy selector, separate from the shared market calculation.
// Keep the legacy algorithms loadable for old research data, but never offer
// their IDs for new customer selections in NOW mode.
export const STRATEGY_CHOICES=Object.freeze([
 Object.freeze({id:'fibonacci_retest',name:'Fibonacci Retest',
  when:'Quando usar: retrações após uma tendência clara, com reação perto dos níveis de Fibonacci.'}),
 Object.freeze({id:'trend',name:'Trend Following',
  when:'Quando usar: tendência definida, com máximas e mínimas na mesma direção.'}),
 Object.freeze({id:'support_resistance',name:'Suporte e Resistência',
  when:'Quando usar: preço perto de uma zona testada de suporte ou resistência, com reação visível.'}),
 Object.freeze({id:'smart_confluence',name:'Smart Confluence',
  when:'Quando usar: gráfico com tendência e níveis relevantes alinhados; prefira contexto técnico claro.'})
]);
export const DEFAULT_PUBLIC_STRATEGY='fibonacci_retest';
export const PUBLIC_STRATEGY_IDS=Object.freeze(STRATEGY_CHOICES.map(x=>x.id));
const visible=new Set(PUBLIC_STRATEGY_IDS);
export const isPublicStrategy=id=>visible.has(String(id||''));
export const normalizePublicStrategy=(id,fallback=DEFAULT_PUBLIC_STRATEGY)=>
 isPublicStrategy(id)?String(id):fallback;
export const publicStrategyInfo=id=>STRATEGY_CHOICES.find(x=>x.id===id)||STRATEGY_CHOICES[0];
