import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {requireLaserUser} from "../_shared/laser-user-auth.ts";
import {LASER_PAIRING_CODE,laserHmacHex,laserJson,laserServerSecret,normalizeLaserPairingCode} from "../_shared/laser-pairing.ts";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async(req)=>{
 if(req.method!=="POST")return laserJson({error:"method_not_allowed"},405);
 const user=await requireLaserUser(req);if(!user)return laserJson({error:"unauthorized"},401);
 let body:{action?:string;code?:string;sessionId?:string};try{body=await req.json()}catch{return laserJson({error:"invalid_json"},400)}
 if(body.action==="claim"){
  const code=normalizeLaserPairingCode(body.code);if(!LASER_PAIRING_CODE.test(code))return laserJson({claimed:false,reason:"invalid_code"},400);
  const hash=await laserHmacHex(laserServerSecret(),"devinx-laser-mentor-code-v1",code);
  const{data,error}=await user.admin.rpc("laser_internal_claim_mentor",{p_user_id:user.userId,p_pairing_code_hash:hash});
  if(error){const m=String(error.message||"");
   if(m.includes("mentor_offer_not_found"))return laserJson({claimed:false,reason:"not_found_or_expired"},404);
   if(m.includes("mentor_entitlement_required"))return laserJson({claimed:false,reason:"mentor_entitlement_required"},403);
   if(m.includes("mentor_concurrent_limit"))return laserJson({claimed:false,reason:"concurrent_limit"},409);
   if(m.includes("mentor_device_already_active"))return laserJson({claimed:false,reason:"device_already_active"},409);
   return laserJson({claimed:false,reason:"claim_failed"},500);
  }
  const row=Array.isArray(data)?data[0]:data;
  return laserJson({claimed:true,deviceId:row?.device_id,sessionId:row?.mentor_session_id,displayName:row?.display_name,expiresAt:row?.expires_at,billingMode:row?.billing_mode});
 }
 if(body.action==="close"){
  const sessionId=String(body.sessionId||"");if(!UUID.test(sessionId))return laserJson({closed:false,reason:"invalid_session"},400);
  const{data,error}=await user.admin.rpc("laser_internal_close_mentor_session",{p_user_id:user.userId,p_session_id:sessionId});
  if(error){const m=String(error.message||"");return m.includes("mentor_session_not_found")?laserJson({closed:false,reason:"not_found"},404):laserJson({closed:false,reason:"close_failed"},500);}
  const row=Array.isArray(data)?data[0]:data;return laserJson({closed:true,deviceId:row?.device_id??null});
 }
 return laserJson({error:"invalid_action"},400);
});