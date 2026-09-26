import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}

export default {
  fetch: withSupabase({auth:"user"},async(req,ctx)=>{
    if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);

    const userId=String(ctx.userClaims?.sub||"");
    if(!userId)return json({error:"not_found"},404);

    const{data:admin,error:adminError}=await ctx.supabaseAdmin
      .from("devinx_admin_users")
      .select("user_id")
      .eq("user_id",userId)
      .maybeSingle();

    if(adminError||!admin)return json({error:"not_found"},404);

    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_admin_list_devices",{
      p_user_id:userId
    });

    if(error)return json({error:"device_list_failed"},500);

    return json({devices:Array.isArray(data)?data:[]});
  })
};
