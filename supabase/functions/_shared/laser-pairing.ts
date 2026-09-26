export type PairingProof={
  version:number;
  agentVersion:string;
  deviceId:string;
  publicKeyPem:string;
  publicKeyFingerprint:string;
  pairingCode:string;
  expiresAt:string;
  nonce:string;
  signatureBase64:string;
};

export const LASER_PAIRING_CODE=/^[A-HJ-NP-Z2-9]{8}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const HEX32=/^[0-9a-f]{32}$/;
const encoder=new TextEncoder();

export function laserJson(body:unknown,status=200){
  return Response.json(body,{
    status,
    headers:{
      "Cache-Control":"no-store, max-age=0",
      "X-Content-Type-Options":"nosniff"
    }
  });
}

export function bytesToHex(bytes:ArrayBuffer|Uint8Array){
  const array=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(array,b=>b.toString(16).padStart(2,"0")).join("");
}

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

export function laserServerSecret(){
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys){
    const parsed=JSON.parse(keys) as Record<string,string>;
    if(parsed.default)return parsed.default;
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  throw new Error("server_secret_unavailable");
}

export async function laserHmacHex(secret:string,purpose:string,value:string){
  const key=await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {name:"HMAC",hash:"SHA-256"},
    false,
    ["sign"]
  );
  return bytesToHex(await crypto.subtle.sign("HMAC",key,encoder.encode(purpose+"\n"+value)));
}

export function normalizeLaserPairingCode(value:unknown){
  return String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
}

function canonical(proof:PairingProof){
  return [
    "devinx-laser-pair-v1",
    proof.deviceId,
    proof.publicKeyFingerprint,
    proof.agentVersion,
    proof.pairingCode,
    String(Math.floor(Date.parse(proof.expiresAt)/1000)),
    proof.nonce
  ].join("\n");
}

export async function verifyLaserPairingProof(proof:PairingProof){
  if(proof.version!==1)return "protocol_version";
  if(typeof proof.agentVersion!=="string"||proof.agentVersion.length<1||proof.agentVersion.length>40)return "agent_version";
  if(!UUID.test(proof.deviceId))return "device_id";
  if(!HEX64.test(proof.publicKeyFingerprint))return "fingerprint";
  if(!LASER_PAIRING_CODE.test(proof.pairingCode))return "pairing_code";
  if(!HEX32.test(proof.nonce))return "nonce";
  if(typeof proof.publicKeyPem!=="string"||proof.publicKeyPem.length<100||proof.publicKeyPem.length>2048)return "public_key";
  if(typeof proof.signatureBase64!=="string"||proof.signatureBase64.length<60||proof.signatureBase64.length>128)return "signature";

  const expiry=Date.parse(proof.expiresAt);
  const now=Date.now();
  if(!Number.isFinite(expiry)||expiry<=now||expiry-now>6*60*1000)return "expired";

  let spki:Uint8Array;
  try{spki=pemSpki(proof.publicKeyPem)}catch{return "public_key"}

  const calculated=bytesToHex(await crypto.subtle.digest("SHA-256",spki));
  if(calculated!==proof.publicKeyFingerprint)return "fingerprint_mismatch";

  try{
    const key=await crypto.subtle.importKey(
      "spki",
      spki,
      {name:"ECDSA",namedCurve:"P-256"},
      false,
      ["verify"]
    );
    const signature=base64Bytes(proof.signatureBase64);
    const valid=await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},
      key,
      signature,
      encoder.encode(canonical(proof))
    );
    return valid?null:"signature";
  }catch{
    return "signature";
  }
}
