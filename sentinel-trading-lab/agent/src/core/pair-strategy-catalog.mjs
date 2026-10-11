/** Shared UI/core choices. Labels contain no experiment-only terminology. */
export const PAIR_STRATEGIES=Object.freeze([
 Object.freeze({id:'pair_reversal',name:'Mean Reversion + Smart Confluence',
  engines:Object.freeze(['mean_reversion','smart_confluence']),versions:Object.freeze([70,67])}),
 Object.freeze({id:'pair_levels_breakout',name:'Suporte/Resistência + Breakout',
  engines:Object.freeze(['support_resistance','breakout']),versions:Object.freeze([67,67])}),
 Object.freeze({id:'pair_retest',name:'Mean Reversion + Fibonacci Retest',
  engines:Object.freeze(['mean_reversion','fibonacci_retest']),versions:Object.freeze([70,70])})
]);
