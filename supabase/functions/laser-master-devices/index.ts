import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {requireLaserUser} from "../_shared/laser-user-auth.ts";
function json(body:unknown,status=200){return Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff"}});}
Deno.serve(async(req)=>{
  if(req.method!=="GET"&&req.method!=="POST")return json({error:"method_not_allowed"},405);
  const user=await requireLaserUser(req);if(!user)return json({error:"unauthorized"},401);
  const{data,error}=await user.admin.rpc("laser_internal_list_devices",{p_user_id:user.userId});
  if(error)return json({error:"device_list_failed"},500);
  return json({devices:Array.isArray(data)?data:[]});
});