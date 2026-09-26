import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const encoder=new TextEncoder();
const CODE=/^[A-HJ-NP-Z2-9]{8}$/;

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}

function hex(bytes:ArrayBuffer|Uint8Array){
  const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
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

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="POST")return json({error:"method_not_allowed"},405);

    const userId=String(ctx.userClaims?.sub||"");
    if(!userId)return json({error:"not_found"},404);

    const{data:admin,error:adminError}=await ctx.supabaseAdmin
      .from("devinx_admin_users")
      .select("user_id")
      .eq("user_id",userId)
      .maybeSingle();

    if(adminError||!admin)return json({error:"not_found"},404);

    let body:{pairingCode?:string;displayName?:string};
    try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

    const pairingCode=String(body.pairingCode||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const displayName=String(body.displayName||"PC Windows").trim().slice(0,80)||"PC Windows";

    if(!CODE.test(pairingCode))return json({claimed:false,reason:"invalid_code"},400);

    const codeHash=await hmacHex(serverSecret(),"devinx-laser-pairing-code-v1",pairingCode);

    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_claim_pairing",{
      p_user_id:userId,
      p_pairing_code_hash:codeHash,
      p_display_name:displayName
    });

    if(error){
      const message=String(error.message||"");
      if(message.includes("pairing_offer_not_found"))return json({claimed:false,reason:"not_found_or_expired"},404);
      if(message.includes("device_already_owned"))return json({claimed:false,reason:"device_already_owned"},409);
      if(message.includes("laser_pc_limit_reached"))return json({claimed:false,reason:"pc_limit"},409);
      if(message.includes("laser_entitlement_required"))return json({claimed:false,reason:"entitlement_required"},403);
      return json({claimed:false,reason:"claim_failed"},500);
    }

    const row=Array.isArray(data)?data[0]:data;
    return json({claimed:true,deviceId:row?.device_id??null,status:row?.status??"active"});
  })
};
