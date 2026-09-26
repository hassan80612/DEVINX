import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
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

    let body:{deviceId?:string;action?:string};
    try{body=await req.json()}catch{return json({ok:false,reason:"invalid_json"},400)}

    const deviceId=String(body.deviceId||"");
    const action=String(body.action||"");
    if(!UUID.test(deviceId))return json({ok:false,reason:"invalid_device_id"},400);
    if(action!=="revoke"&&action!=="reactivate")return json({ok:false,reason:"invalid_action"},400);

    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_admin_set_device_access",{
      p_user_id:userId,
      p_device_id:deviceId,
      p_action:action
    });

    if(error){
      const message=String(error.message||"");
      if(message.includes("device_not_found"))return json({ok:false,reason:"device_not_found"},404);
      if(message.includes("invalid_device_action"))return json({ok:false,reason:"invalid_action"},400);
      return json({ok:false,reason:"device_access_failed"},500);
    }

    const row=Array.isArray(data)?data[0]:data;
    return json({ok:true,deviceId:row?.device_id??deviceId,status:row?.device_status??null});
  })
};
