import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import {
  laserHmacHex,
  laserJson,
  laserServerSecret,
  verifyLaserPairingProof,
  type PairingProof
} from "../_shared/laser-pairing.ts";

export default {
  fetch: withSupabase({auth:"none"},async(req,ctx)=>{
    if(req.method!=="POST")return laserJson({error:"method_not_allowed"},405);

    const contentLength=Number(req.headers.get("content-length")||"0");
    if(contentLength>12000)return laserJson({error:"payload_too_large"},413);

    let raw="";
    try{raw=await req.text()}catch{return laserJson({error:"invalid_body"},400)}
    if(raw.length>12000)return laserJson({error:"payload_too_large"},413);

    let proof:PairingProof;
    try{proof=JSON.parse(raw) as PairingProof}catch{return laserJson({error:"invalid_json"},400)}

    const failure=await verifyLaserPairingProof(proof);
    if(failure)return laserJson({accepted:false,reason:failure},400);

    const secret=laserServerSecret();
    const codeHash=await laserHmacHex(secret,"devinx-laser-pairing-code-v1",proof.pairingCode);
    const nonceHash=await laserHmacHex(secret,"devinx-laser-pairing-nonce-v1",proof.nonce);
    const sourceIp=(req.headers.get("x-forwarded-for")||req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
    const ipHash=await laserHmacHex(secret,"devinx-laser-source-ip-v1",sourceIp);

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
      if(message.includes("pairing_rate_limited"))return laserJson({accepted:false,reason:"rate_limited"},429);
      if(message.includes("invalid_pairing_offer"))return laserJson({accepted:false,reason:"invalid_offer"},400);
      return laserJson({accepted:false,reason:"storage_error"},500);
    }

    return laserJson({accepted:true,offerId:data,expiresAt:proof.expiresAt});
  })
};
