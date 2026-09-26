const encoder=new TextEncoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const NONCE=/^[0-9a-f]{32}$/;

function base64Bytes(value:string){
  const raw=atob(value);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function pemSpki(pem:string){
  const body=pem.replace(/-----BEGIN PUBLIC KEY-----/g,"")
    .replace(/-----END PUBLIC KEY-----/g,"").replace(/\s+/g,"");
  return base64Bytes(body);
}

export type CommandEnvelope={
  deviceId:string;
  publicKeyFingerprint:string;
  sentAt:number;
  nonce:string;
  action:"poll"|"ack"|"uninstall";
  commandId?:string;
  ok?:boolean;
  reason?:string;
  knownSessionId?:string|null;
  knownRevision?:number;
  signatureBase64:string;
};

export function validate(e:CommandEnvelope){
  if(!UUID.test(e.deviceId))return "device_id";
  if(!HEX64.test(e.publicKeyFingerprint))return "fingerprint";
  if(!Number.isSafeInteger(e.sentAt)||Math.abs(Math.floor(Date.now()/1000)-e.sentAt)>60)return "sent_at";
  if(!NONCE.test(e.nonce))return "nonce";
  if(!["poll","ack","uninstall"].includes(e.action))return "action";
  if(e.action==="ack"&&(!UUID.test(String(e.commandId||""))||typeof e.ok!=="boolean"))return "ack";
  if(e.action==="poll"&&e.knownSessionId!=null&&!UUID.test(String(e.knownSessionId)))return "known_session";
  if(e.action==="poll"&&e.knownRevision!=null&&(!Number.isSafeInteger(e.knownRevision)||Number(e.knownRevision)<0))return "known_revision";
  if(typeof e.signatureBase64!=="string"||e.signatureBase64.length<60||e.signatureBase64.length>128)return "signature";
  if(e.reason&&e.reason.length>160)return "reason";
  return null;
}

export function canonical(e:CommandEnvelope){
  return [
    "devinx-laser-command-v2",
    e.deviceId,
    e.publicKeyFingerprint,
    String(e.sentAt),
    e.nonce,
    e.action,
    e.action==="ack"?String(e.commandId||""):"",
    e.action==="ack"?(e.ok?"1":"0"):"",
    e.action==="ack"?String(e.reason||""):"",
    e.action==="poll"?String(e.knownSessionId||""):"",
    e.action==="poll"?String(e.knownRevision??0):""
  ].join("\n");
}

export async function verify(e:CommandEnvelope,publicKeyPem:string){
  try{
    const key=await crypto.subtle.importKey("spki",pemSpki(publicKeyPem),
      {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
    return await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},key,
      base64Bytes(e.signatureBase64),encoder.encode(canonical(e)));
  }catch{return false}
}
