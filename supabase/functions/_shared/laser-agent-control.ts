const encoder=new TextEncoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const NONCE=/^[0-9a-f]{32}$/;

function base64Bytes(value:string){
  const raw=atob(value);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

function pemSpki(pem:string){
  const body=pem
    .replace(/-----BEGIN PUBLIC KEY-----/g,"")
    .replace(/-----END PUBLIC KEY-----/g,"")
    .replace(/\s+/g,"");
  return base64Bytes(body);
}

export type AgentControlEnvelope={
  deviceId:string;
  publicKeyFingerprint:string;
  sentAt:number;
  nonce:string;
  action:"poll"|"arm";
  enabled?:boolean;
  afterSeq?:number;
  signatureBase64:string;
};

export function validateAgentControlEnvelope(e:AgentControlEnvelope){
  if(!UUID.test(e.deviceId))return "device_id";
  if(!HEX64.test(e.publicKeyFingerprint))return "fingerprint";
  if(!Number.isSafeInteger(e.sentAt)||Math.abs(Math.floor(Date.now()/1000)-e.sentAt)>60)return "sent_at";
  if(!NONCE.test(e.nonce))return "nonce";
  if(e.action!=="poll"&&e.action!=="arm")return "action";
  if(e.action==="poll"&&(!Number.isSafeInteger(e.afterSeq)||Number(e.afterSeq)<0))return "after_seq";
  if(e.action==="arm"&&typeof e.enabled!=="boolean")return "enabled";
  if(typeof e.signatureBase64!=="string"||e.signatureBase64.length<60||e.signatureBase64.length>128)return "signature";
  return null;
}

export function canonicalAgentControl(e:AgentControlEnvelope){
  return [
    "devinx-laser-preview-control-v1",
    e.deviceId,
    e.publicKeyFingerprint,
    String(e.sentAt),
    e.nonce,
    e.action,
    e.action==="arm"?(e.enabled?"1":"0"):"",
    e.action==="poll"?String(e.afterSeq??0):""
  ].join("\n");
}

export async function verifyAgentControlSignature(e:AgentControlEnvelope,publicKeyPem:string){
  try{
    const key=await crypto.subtle.importKey(
      "spki",
      pemSpki(publicKeyPem),
      {name:"ECDSA",namedCurve:"P-256"},
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},
      key,
      base64Bytes(e.signatureBase64),
      encoder.encode(canonicalAgentControl(e))
    );
  }catch{return false}
}
