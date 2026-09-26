import {LASER_REMOTE_COMMANDS_ENABLED,type LaserCommand} from '@/features/laser-control/protocol';
import {LASER_ADAPTER_CAPABILITIES,type LaserAdapterId} from '@/features/laser-control/capabilities';
import {canStartLaserRemotely,canUseLaserSession,type LaserDeviceState,type LaserSessionState} from '@/features/laser-control/session-policy';

export type LaserCommandPolicyInput={
  command:LaserCommand;
  adapter:LaserAdapterId;
  session:LaserSessionState;
  device:LaserDeviceState;
  now?:number;
};

function adapterSupportsCommand(adapter:LaserAdapterId,command:LaserCommand){
  const capabilities=LASER_ADAPTER_CAPABILITIES[adapter];
  switch(command){
    case 'status':return capabilities.readConnection||capabilities.readJobState;
    case 'frame':return capabilities.frame;
    case 'pause':return capabilities.pause;
    case 'resume':return capabilities.pause;
    case 'stop':return capabilities.stop;
    case 'start':return capabilities.start;
  }
}

export function evaluateLaserCommandPolicy(input:LaserCommandPolicyInput){
  const now=input.now??Date.now();

  if(!LASER_REMOTE_COMMANDS_ENABLED)
    return {allowed:false as const,reason:'remote_commands_disabled' as const};

  if(!adapterSupportsCommand(input.adapter,input.command))
    return {allowed:false as const,reason:'adapter_capability_missing' as const};

  if(input.command==='start'){
    const decision=canStartLaserRemotely(input.session,input.device,now);
    return decision.allowed
      ?{allowed:true as const,reason:'ok' as const}
      :decision;
  }

  const sessionDecision=canUseLaserSession(input.session,input.device,now);
  return sessionDecision.allowed
    ?{allowed:true as const,reason:'ok' as const}
    :sessionDecision;
}
