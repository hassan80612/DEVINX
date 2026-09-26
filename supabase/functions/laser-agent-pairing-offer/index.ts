import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

type PairingProof={
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

const encoder=new TextEncoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const HEX32=/^[0-9a-f]{32}$/;
const CODE=/^[A-HJ-NP-Z2-9]{8}$/;

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}

function hex(bytes:ArrayBuffer|Uint8Array){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}

function base64Bytes(value:string){
  const raw=atob(value);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

function pemSpki(pem:string){
  const body=pem.replace(/-----BEGIN PUBLIC KEY-----/g,"")
    .replace(/-----END PUBLIC KEY-----/g,"")
    .replace(/\s+/g,"");
  return base64Bytes(body);
}

function canonical(p:PairingProof){
  return [
    "devinx-laser-pair-v1",
    p.deviceId,
    p.publicKeyFingerprint,
    p.agentVersion,
    p.pairingCode,
    String(Math.floor(Date.parse(p.expiresAt)/1000)),
    p.nonce
  ].join("\n");
}

function serverSecret(){
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys){
    const parsed=JSON.parse(keys) as Record<string,string>;
    if(parsed.default)return parsed.default;
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  throw new Error("server_secret_unavailable");
}

async function hmacHex(secret:string,purpose:string,value:string){
  const key=await crypto.subtle.importKey(
    "raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC",key,encoder.encode(purpose+"\n"+value)));
}

async function verifyProof(p:PairingProof){
  if(p.version!==1)return "protocol_version";
  if(typeof p.agentVersion!=="string"||p.agentVersion.length<1||p.agentVersion.length>40)return "agent_version";
  if(!UUID.test(p.deviceId))return "device_id";
  if(!HEX64.test(p.publicKeyFingerprint))return "fingerprint";
  if(!CODE.test(p.pairingCode))return "pairing_code";
  if(!HEX32.test(p.nonce))return "nonce";
  if(typeof p.publicKeyPem!=="string"||p.publicKeyPem.length<100||p.publicKeyPem.length>2048)return "public_key";
  if(typeof p.signatureBase64!=="string"||p.signatureBase64.length<60||p.signatureBase64.length>128)return "signature";

  const expiry=Date.parse(p.expiresAt);
  const now=Date.now();
  if(!Number.isFinite(expiry)||expiry<=now||expiry-now>6*60*1000)return "expired";

  let spki:Uint8Array;
  try{spki=pemSpki(p.publicKeyPem)}catch{return "public_key"}

  const calculated=hex(await crypto.subtle.digest("SHA-256",spki));
  if(calculated!==p.publicKeyFingerprint)return "fingerprint_mismatch";

  try{
    const key=await crypto.subtle.importKey(
      "spki",spki,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]
    );
    const signature=base64Bytes(p.signatureBase64);
    const ok=await crypto.subtle.verify(
      {name:"ECDSA",hash:"SHA-256"},key,signature,encoder.encode(canonical(p))
    );
    return ok?null:"signature";
  }catch{
    return "signature";
  }
}

export default {
  fetch: withSupabase({auth:"none"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"method_not_allowed"},405);

    const contentLength=Number(req.headers.get("content-length")||"0");
    if(contentLength>12000)return json({error:"payload_too_large"},413);

    let raw="";
    try{raw=await req.text()}catch{return json({error:"invalid_body"},400)}
    if(raw.length>12000)return json({error:"payload_too_large"},413);

    let proof:PairingProof;
    try{proof=JSON.parse(raw) as PairingProof}catch{return json({error:"invalid_json"},400)}

    const failure=await verifyProof(proof);
    if(failure)return json({accepted:false,reason:failure},400);

    const secret=serverSecret();
    const codeHash=await hmacHex(secret,"devinx-laser-pairing-code-v1",proof.pairingCode);
    const nonceHash=await hmacHex(secret,"devinx-laser-pairing-nonce-v1",proof.nonce);
    const sourceIp=(req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
    const ipHash=await hmacHex(secret,"devinx-laser-source-ip-v1",sourceIp);

    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_store_pairing_offer",{
      p_device_id:proof.deviceId,
      p_public_key_pem:proof.publicKeyPem,
      p_public_key_fingerprint:proof.publicKeyFingerprint,
      p_pairing_code_hash:codeHash,
      p_nonce_hash:nonceHash,
      p_source_ip_hash:ipHash,
      p_agent_version:proof.agentVersion,
      p_expires_at:proof.expiresAt
    });

    if(error){
      const message=String(error.message||"");
      if(message.includes("pairing_rate_limited"))return json({accepted:false,reason:"rate_limited"},429);
      if(message.includes("invalid_pairing_offer"))return json({accepted:false,reason:"invalid_offer"},400);
      return json({accepted:false,reason:"storage_error"},500);
    }

    return json({accepted:true,offerId:data,expiresAt:proof.expiresAt});
  })
};
