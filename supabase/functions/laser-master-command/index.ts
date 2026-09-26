import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {requireLaserMaster} from "../_shared/laser-user-auth.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED=new Set(["start","pause","stop","frame"]);

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{
    "Cache-Control":"no-store, max-age=0",
    "X-Content-Type-Options":"nosniff"
  }});
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const ctx=await requireLaserMaster(req);
  if(!ctx)return json({error:"not_found"},404);

  let body:{action?:string;deviceId?:string;sessionId?:string;command?:string;commandId?:string;idempotencyKey?:string};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

  if(body.action==="send"){
    const deviceId=String(body.deviceId||"");
    const sessionId=String(body.sessionId||"");
    const command=String(body.command||"");
    const idempotencyKey=String(body.idempotencyKey||"");
    if(!UUID.test(deviceId)||!UUID.test(sessionId)||!UUID.test(idempotencyKey)||!ALLOWED.has(command))
      return json({error:"invalid_command"},400);

    const{data,error}=await ctx.admin.rpc("laser_internal_enqueue_session_command",{
      p_user_id:ctx.userId,
      p_session_id:sessionId,
      p_device_id:deviceId,
      p_command_type:command,
      p_idempotency_key:idempotencyKey
    });
    if(error){
      const message=String(error.message||"");
      if(message.includes("remote_session_not_found"))
        return json({error:"remote_session_not_found"},409);
      if(message.includes("machine_not_connected"))
        return json({error:"machine_not_connected"},409);
      if(message.includes("machine_not_idle"))
        return json({error:"machine_not_idle"},409);
      if(message.includes("not_running"))
        return json({error:"not_running"},409);
      return json({error:"command_enqueue_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({
      commandId:row?.command_id??null,
      status:row?.status??"queued",
      expiresAt:row?.expires_at??null
    });
  }

  if(body.action==="status"){
    const commandId=String(body.commandId||"");
    if(!UUID.test(commandId))return json({error:"invalid_command_id"},400);

    const{data,error}=await ctx.admin.rpc("laser_internal_command_status",{
      p_user_id:ctx.userId,
      p_command_id:commandId
    });
    if(error)return json({error:"command_status_failed"},500);
    const row=Array.isArray(data)?data[0]:data;
    if(!row)return json({error:"not_found"},404);
    return json({
      commandId:row.command_id,
      command:row.command_type,
      status:row.status,
      rejectionReason:row.rejection_reason??null,
      createdAt:row.created_at,
      deliveredAt:row.delivered_at??null,
      acknowledgedAt:row.acknowledged_at??null
    });
  }

  return json({error:"invalid_action"},400);
});
