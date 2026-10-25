// Presentation-only fingerprint. Quote arrivals do not repaint account fields.
export function executorReadoutKey(s){
 return JSON.stringify([s.provider,s.enabled,s.arming,s.executing,s.message,s.suspendedReason,s.startedAt,
  s.sessionWins,s.sessionLosses,s.netPnl,s.executed,s.closed,s.availableBalance,
  s.brokerBalance?.amount,s.brokerBalance?.receivedAt,s.brokerBalance?.revision,
  s.riskNetPnl,s.nextClicks,s.lossLimitRemaining,s.pending?.state,
  s.unresolvedDetail,s.config]);
}
// Read-only patch: no template parser, broker DOM traversal, layout measurement
// or order control changes. The monitor elements were created by normal render.
export function patchExecutorReadouts(frame){
 const previous=window.__sentinelExecutorReadouts;
 if(previous&&previous.revision>frame.revision)return;
 window.__sentinelExecutorReadouts=frame;
 const apply=()=>{
  const latest=window.__sentinelExecutorReadouts;
  const root=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
  const f=latest?.readout;
  if(!root||!f)return;
  const patch=(selector,value)=>{
   if(value===undefined||value===null)return;
   const node=root.querySelector(selector);if(!node)return;
   const next=String(value);if(node.textContent!==next)node.textContent=next;
  };
  patch('[data-sentinel-executor-wl]',f.winLoss);
  patch('[data-sentinel-executor-broker-balance]',f.brokerBalance);
  patch('[data-sentinel-executor-risk]',f.risk);
  patch('[data-sentinel-executor-balance]',f.balance);
  patch('[data-sentinel-executor-session]',f.session);
  patch('[data-sentinel-executor-message]',f.message);
  patch('[data-sentinel-executor-state]',f.status);
  patch('[data-sentinel-stop-targets]',f.stopTargets);
  const state=root.querySelector('[data-sentinel-executor-state]');
  if(state&&state.getAttribute('data-bot-state')!==f.state)state.setAttribute('data-bot-state',f.state);
  const robot=root.querySelector('[data-sentinel-robot]');
  if(robot&&robot.getAttribute('data-state')!==f.state)robot.setAttribute('data-state',f.state);
  const clock=root.querySelector('[data-sentinel-executor-clock-wl]');
  if(clock&&Number.isFinite(f.wins)&&Number.isFinite(f.losses)){
   if(clock.children[0]&&clock.children[0].textContent!=='WIN: '+f.wins)clock.children[0].textContent='WIN: '+f.wins;
   if(clock.children[1]&&clock.children[1].textContent!=='LOSS: '+f.losses)clock.children[1].textContent='LOSS: '+f.losses;
  }
  patch('[data-sentinel-mg-readout]',f.martingale);
  for(const [action,disabled] of [['start',f.disabledStart],['map',f.disabledMap]]){
   const node=root.querySelector('[data-sentinel-executor-action="'+action+'"]');
   if(node&&typeof disabled==='boolean'&&node.disabled!==disabled)node.disabled=disabled;
  }
 };
 window.__sentinelApplyExecutorReadouts=apply;
 apply();
}
