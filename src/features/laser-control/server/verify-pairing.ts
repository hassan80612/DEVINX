import {createHash,createPublicKey,verify} from 'node:crypto';
import {isFreshPairingProof,isLaserPairingCode,type LaserPairingProof} from '@/features/laser-control/pairing';

function canonicalPayload(proof:LaserPairingProof){
  return [
    'devinx-laser-pair-v1',
    proof.deviceId,
    proof.publicKeyFingerprint,
    proof.agentVersion,
    proof.pairingCode,
    String(Math.floor(Date.parse(proof.expiresAt)/1000)),
    proof.nonce
  ].join('\n');
}

function fingerprintFromPem(publicKeyPem:string){
  const key=createPublicKey(publicKeyPem);
  const der=key.export({type:'spki',format:'der'});
  return createHash('sha256').update(der).digest('hex');
}

export function verifyLaserPairingProof(proof:LaserPairingProof,now=Date.now()){
  if(proof.version!==1)return {ok:false as const,reason:'protocol_version'};
  if(!/^[0-9a-f-]{36}$/i.test(proof.deviceId))return {ok:false as const,reason:'device_id'};
  if(typeof proof.agentVersion!=='string'||proof.agentVersion.length<1||proof.agentVersion.length>40)return {ok:false as const,reason:'agent_version'};
  if(!/^[0-9a-f]{64}$/.test(proof.publicKeyFingerprint))return {ok:false as const,reason:'fingerprint'};
  if(!isLaserPairingCode(proof.pairingCode))return {ok:false as const,reason:'pairing_code'};
  if(!/^[0-9a-f]{32}$/.test(proof.nonce))return {ok:false as const,reason:'nonce'};
  if(!isFreshPairingProof(proof.expiresAt,now))return {ok:false as const,reason:'expired'};

  let actualFingerprint:string;
  try{actualFingerprint=fingerprintFromPem(proof.publicKeyPem)}
  catch{return {ok:false as const,reason:'public_key'}}

  if(actualFingerprint!==proof.publicKeyFingerprint)return {ok:false as const,reason:'fingerprint_mismatch'};

  let signature:Buffer;
  try{signature=Buffer.from(proof.signatureBase64,'base64')}
  catch{return {ok:false as const,reason:'signature'}}

  const valid=verify(
    'sha256',
    Buffer.from(canonicalPayload(proof),'utf8'),
    {key:createPublicKey(proof.publicKeyPem),dsaEncoding:'ieee-p1363'},
    signature
  );

  return valid
    ?{ok:true as const,deviceId:proof.deviceId,publicKeyFingerprint:proof.publicKeyFingerprint}
    :{ok:false as const,reason:'signature'};
}
