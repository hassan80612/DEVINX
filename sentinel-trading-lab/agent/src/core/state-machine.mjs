const allowed={stopped:new Set(['armed']),armed:new Set(['running','stopped']),running:new Set(['paused','stopped','error']),paused:new Set(['running','stopped','error']),error:new Set(['stopped'])};
export function transition(current,next){if(current===next)return next;if(!allowed[current]?.has(next))throw new Error(`invalid_transition:${current}->${next}`);return next}
export function kill(){return 'stopped'}
