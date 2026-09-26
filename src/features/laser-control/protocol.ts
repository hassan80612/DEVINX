export const LASER_AGENT_PROTOCOL_VERSION=1 as const;

export const LASER_REMOTE_COMMANDS_ENABLED=false as const;

export const LASER_COMMANDS=[
  'status',
  'frame',
  'pause',
  'resume',
  'stop',
  'start'
] as const;

export type LaserCommand=(typeof LASER_COMMANDS)[number];

export type LaserCapability={
  command:LaserCommand;
  supported:boolean;
  reason?:string;
};

export type LaserAgentHeartbeat={
  protocolVersion:typeof LASER_AGENT_PROTOCOL_VERSION;
  agentVersion:string;
  deviceId:string;
  adapter:'lightburn-udp-legacy'|'lightburn-rest';
  lightBurnOnline:boolean;
  machineState:'unknown'|'idle'|'busy';
  remoteControlEnabled:boolean;
  localArmUntil:string|null;
  capabilities:LaserCapability[];
  sentAt:string;
};

export type LaserCommandEnvelope={
  id:string;
  deviceId:string;
  sessionId:string;
  command:LaserCommand;
  payload:Record<string,unknown>;
  createdAt:string;
  expiresAt:string;
  idempotencyKey:string;
};

export function isLaserCommand(value:unknown):value is LaserCommand{
  return typeof value==='string'&&(LASER_COMMANDS as readonly string[]).includes(value);
}

export function canDispatchRemoteCommand(command:LaserCommand){
  // Hard off-switch while pairing/auth/transport are unfinished.
  if(!LASER_REMOTE_COMMANDS_ENABLED)return false;
  return command!=='start';
}
