import {bytesToHex,laserJson,LASER_PAIRING_CODE} from "./laser-pairing.ts";
export {laserJson};
export type MentorProof={
  version:number;agentVersion:string;deviceId:string;deviceName:string;publicKeyPem:string;
  publicKeyFingerprint:string;pairingCode:string;expiresAt:string;nonce:string;signatureBase64:string;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;const HEX32=/^[0-9a-f]{32}$/;const encoder=new TextEncoder();
function base64Bytes(value:string){const raw=atob(value);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
function pemSpki(pem:string){const body=pem.replace(/-----BEGIN PUBLIC KEY-----/g,"").replace(/-----END PUBLIC KEY-----/g,"").replace(/\s+/g,"");return base64Bytes(body);}
function canonical(p:MentorProof){return ["devinx-laser-mentor-v1",p.deviceId,p.publicKeyFingerprint,p.agentVersion,p.deviceName,p.pairingCode,String(Math.floor(Date.parse(p.expiresAt)/1000)),p.nonce].join("\n");}
export async function verifyMentorProof(p:MentorProof){
  if(p.version!==1)return "protocol_version";
  if(typeof p.agentVersion!=="string"||p.agentVersion.length<1||p.agentVersion.length>40)return "agent_version";
  if(!UUID.test(p.deviceId))return "device_id";
  if(typeof p.deviceName!=="string"||p.deviceName.trim().length<1||p.deviceName.trim().length>80)return "device_name";
  if(!HEX64.test(p.publicKeyFingerprint))return "fingerprint";
  if(!LASER_PAIRING_CODE.test(p.pairingCode))return "pairing_code";
  if(!HEX32.test(p.nonce))return "nonce";
  if(typeof p.publicKeyPem!=="string"||p.publicKeyPem.length<100||p.publicKeyPem.length>2048)return "public_key";
  if(typeof p.signatureBase64!=="string"||p.signatureBase64.length<60||p.signatureBase64.length>128)return "signature";
  const expiry=Date.parse(p.expiresAt),now=Date.now();
  if(!Number.isFinite(expiry)||expiry<=now||expiry-now>6*60*1000)return "expired";
  let spki:Uint8Array;try{spki=pemSpki(p.publicKeyPem)}catch{return "public_key";}
  const calculated=bytesToHex(await crypto.subtle.digest("SHA-256",spki));
  if(calculated!==p.publicKeyFingerprint)return "fingerprint_mismatch";
  try{
    const key=await crypto.subtle.importKey("spki",spki,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    return await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,base64Bytes(p.signatureBase64),encoder.encode(canonical(p)))?null:"signature";
  }catch{return "signature";}
}