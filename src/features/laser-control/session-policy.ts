export type LaserDeviceState={
  revoked:boolean;
  remoteControlEnabled:boolean;
  localArmUntil:string|null;
};

export type LaserSessionState={
  status:'active'|'released'|'expired'|'revoked';
  expiresAt:string;
};

export function canUseLaserSession(session:LaserSessionState,device:LaserDeviceState,now=Date.now()){
  if(device.revoked)return {allowed:false as const,reason:'device_revoked' as const};
  if(session.status!=='active')return {allowed:false as const,reason:'session_inactive' as const};
  if(Date.parse(session.expiresAt)<=now)return {allowed:false as const,reason:'session_expired' as const};
  if(!device.remoteControlEnabled)return {allowed:false as const,reason:'remote_disabled' as const};
  return {allowed:true as const,reason:'ok' as const};
}

export function canStartLaserRemotely(session:LaserSessionState,device:LaserDeviceState,now=Date.now()){
  const sessionDecision=canUseLaserSession(session,device,now);
  if(!sessionDecision.allowed)return sessionDecision;

  if(!device.localArmUntil||Date.parse(device.localArmUntil)<=now)
    return {allowed:false as const,reason:'local_arm_required' as const};

  return {allowed:true as const,reason:'ok' as const};
}
