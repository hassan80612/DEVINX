import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {requireLaserMaster} from "../_shared/laser-user-auth.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body:{action?:string;deviceId?:string;sessionId?:string;enabled?:boolean};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

  if(body.action==="open"||body.action==="renew"){
    const deviceId=String(body.deviceId||"");
    if(!UUID.test(deviceId))return json({error:"invalid_device"},400);

    const{data,error}=await ctx.admin.rpc("laser_internal_open_remote_session",{
      p_user_id:ctx.userId,
      p_device_id:deviceId
    });
    if(error){
      const message=String(error.message||"");
      return message.includes("remote_device_not_found")
        ?json({error:"not_found"},404)
        :json({error:"remote_session_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    if(!row)return json({error:"remote_session_failed"},500);

    return json({
      sessionId:row.session_id,
      topic:row.topic,
      frameToken:row.frame_token,
      controlToken:row.control_token,
      inputToken:row.input_token??null,
      remoteInputEnabled:Boolean(row.remote_input_enabled),
      revision:Number(row.revision||0),
      expiresAt:row.expires_at
    });
  }

  if(body.action==="input"){
    const sessionId=String(body.sessionId||"");
    if(!UUID.test(sessionId))return json({error:"invalid_session"},400);
    const{data,error}=await ctx.admin.rpc("laser_internal_set_remote_input",{
      p_user_id:ctx.userId,
      p_session_id:sessionId,
      p_enabled:body.enabled===true
    });
    if(error){
      const message=String(error.message||"");
      return message.includes("remote_session_not_found")
        ?json({error:"session_not_found"},404)
        :json({error:"remote_input_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({
      enabled:Boolean(row?.enabled),
      inputToken:row?.input_token??null,
      revision:Number(row?.revision||0),
      expiresAt:row?.expires_at??null
    });
  }

  if(body.action==="close"){
    const sessionId=String(body.sessionId||"");
    if(!UUID.test(sessionId))return json({error:"invalid_session"},400);
    const{data,error}=await ctx.admin.rpc("laser_internal_close_remote_session",{
      p_user_id:ctx.userId,
      p_session_id:sessionId
    });
    if(error)return json({error:"remote_session_close_failed"},500);
    return json({closed:data===true});
  }

  return json({error:"invalid_action"},400);
});
