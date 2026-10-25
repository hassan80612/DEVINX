// Presentation-only fingerprint. Quote arrivals do not repaint account fields.
export function executorReadoutKey(s){
 return JSON.stringify([s.provider,s.enabled,s.arming,s.executing,s.message,s.startedAt,
  s.sessionWins,s.sessionLosses,s.netPnl,s.executed,s.closed,s.availableBalance,
  s.brokerBalance?.amount,s.brokerBalance?.receivedAt,s.brokerBalance?.revision,
  s.riskNetPnl,s.nextClicks,s.lossLimitRemaining,s.pending?.state,
  s.unresolvedDetail,s.config]);
}
// Self-contained browser function. Touch only the Sentinel shadow root, never
// the broker chart, account controls, inputs being edited, or layout geometry.
export function patchExecutorReadouts(frame){
 const previous=window.__sentinelExecutorReadouts;
 if(previous&&previous.revision>frame.revision)return;
 window.__sentinelExecutorReadouts=frame;
 const apply=()=>{
  const latest=window.__sentinelExecutorReadouts;
  const root=document.getElementById('sentinel-trading-overlay-host')?.shadowRoot;
  if(!root||!latest)return;
  const template=document.createElement('template');template.innerHTML=latest.html;
  for(const selector of ['[data-sentinel-executor-wl]','[data-sentinel-executor-broker-balance]',
   '[data-sentinel-executor-risk]','[data-sentinel-executor-balance]',
   '[data-sentinel-executor-session]','[data-sentinel-executor-message]',
   '[data-sentinel-executor-next]','[data-sentinel-executor-state]']){
   const old=root.querySelector(selector),fresh=template.content.querySelector(selector);
   if(old&&fresh&&old.textContent!==fresh.textContent)old.textContent=fresh.textContent;
  }
  const robot=root.querySelector('[data-sentinel-robot]'),newRobot=template.content.querySelector('[data-sentinel-robot]');
  if(robot&&newRobot)robot.setAttribute('data-state',newRobot.getAttribute('data-state'));
  const clock=root.querySelector('[data-sentinel-executor-clock-wl]');
  if(clock&&Number.isFinite(latest.wins)&&Number.isFinite(latest.losses)){
   if(clock.children[0])clock.children[0].textContent='WIN: '+latest.wins;
   if(clock.children[1])clock.children[1].textContent='LOSS: '+latest.losses;
  }
  for(const action of ['start','map']){
   const selector='[data-sentinel-executor-action="'+action+'"]';
   const old=root.querySelector(selector),fresh=template.content.querySelector(selector);
   if(old&&fresh)old.disabled=fresh.disabled;
  }
 };
 window.__sentinelApplyExecutorReadouts=apply;
 apply();
}
