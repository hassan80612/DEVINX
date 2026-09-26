export const LASER_PAIRING_VERSION=1 as const;
export const LASER_PAIRING_CODE_PATTERN=/^[A-HJ-NP-Z2-9]{8}$/;

export type LaserPairingProof={
  version:typeof LASER_PAIRING_VERSION;
  agentVersion:string;
  deviceId:string;
  publicKeyPem:string;
  publicKeyFingerprint:string;
  pairingCode:string;
  expiresAt:string;
  nonce:string;
  signatureBase64:string;
};

export function normalizeLaserPairingCode(value:string){
  return value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
}

export function isLaserPairingCode(value:string){
  return LASER_PAIRING_CODE_PATTERN.test(value);
}

export function isFreshPairingProof(expiresAt:string,now=Date.now()){
  const expiry=Date.parse(expiresAt);
  return Number.isFinite(expiry)&&expiry>now&&expiry-now<=10*60*1000;
}
