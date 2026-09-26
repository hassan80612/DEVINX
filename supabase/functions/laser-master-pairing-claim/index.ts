import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import {
  LASER_PAIRING_CODE,
  laserHmacHex,
  laserJson,
  laserServerSecret,
  normalizeLaserPairingCode
} from "../_shared/laser-pairing.ts";

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return laserJson({error:"method_not_allowed"},405);

    const userId=String(ctx.userClaims?.sub||"");
    if(!userId)return laserJson({error:"not_found"},404);

    const{data:admin,error:adminError}=await ctx.supabaseAdmin
      .from("devinx_admin_users")
      .select("user_id")
      .eq("user_id",userId)
      .maybeSingle();

    if(adminError||!admin)return laserJson({error:"not_found"},404);

    let body:{pairingCode?:string;displayName?:string};
    try{body=await req.json()}catch{return laserJson({error:"invalid_json"},400)}

    const pairingCode=normalizeLaserPairingCode(body.pairingCode);
    const displayName=String(body.displayName||"PC Windows").trim().slice(0,80)||"PC Windows";
    if(!LASER_PAIRING_CODE.test(pairingCode))return laserJson({claimed:false,reason:"invalid_code"},400);

    const codeHash=await laserHmacHex(laserServerSecret(),"devinx-laser-pairing-code-v1",pairingCode);
    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_claim_pairing",{
      p_user_id:userId,
      p_pairing_code_hash:codeHash,
      p_display_name:displayName
    });

    if(error){
      const message=String(error.message||"");
      if(message.includes("pairing_offer_not_found"))return laserJson({claimed:false,reason:"not_found_or_expired"},404);
      if(message.includes("device_already_owned"))return laserJson({claimed:false,reason:"device_already_owned"},409);
      if(message.includes("laser_pc_limit_reached"))return laserJson({claimed:false,reason:"pc_limit"},409);
      if(message.includes("laser_entitlement_required"))return laserJson({claimed:false,reason:"entitlement_required"},403);
      return laserJson({claimed:false,reason:"claim_failed"},500);
    }

    const row=Array.isArray(data)?data[0]:data;
    return laserJson({claimed:true,deviceId:row?.device_id??null,status:row?.status??"active"});
  })
};
