import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {withSupabase} from "npm:@supabase/server";
import {validate,verify,type CommandEnvelope} from "../_shared/laser-command.ts";

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{
    "Cache-Control":"no-store, max-age=0",
    "X-Content-Type-Options":"nosniff"
  }});
}
function normalizeSession(data:any){
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return null;
  return {
    id:row.session_id,
    topic:row.topic,
    frameToken:row.frame_token,
    controlToken:row.control_token,
    inputToken:row.input_token??null,
    remoteInputEnabled:Boolean(row.remote_input_enabled),
    revision:Number(row.revision||0),
    expiresAt:row.expires_at
  };
}
function normalizeCommand(data:any){
  const row=Array.isArray(data)?data[0]:data;
  if(!row)return null;
  return {id:row.command_id,type:row.command_type,expiresAt:row.expires_at};
}

Deno.serve(withSupabase({auth:"none"},async(req,ctx)=>{
  if(req.method!=="POST")return json({ok:false,reason:"method_not_allowed"},405);
  const len=Number(req.headers.get("content-length")||"0");
  if(len>12000)return json({ok:false,reason:"payload_too_large"},413);

  let envelope:CommandEnvelope;
  try{envelope=await req.json() as CommandEnvelope}
  catch{return json({ok:false,reason:"invalid_json"},400)}

  const invalid=validate(envelope);
  if(invalid)return json({ok:false,reason:invalid},400);

  const{data:authData,error:authError}=await ctx.supabaseAdmin.rpc("laser_internal_device_auth_context",{
    p_device_id:envelope.deviceId
  });
  if(authError)return json({ok:false,reason:"auth_context_failed"},500);
  const auth=Array.isArray(authData)?authData[0]:authData;
  if(!auth)return json({ok:false,reason:"unknown_device"},404);
  if(auth.device_status!=="active")return json({ok:false,reason:"device_not_active"},403);
  if(auth.public_key_fingerprint!==envelope.publicKeyFingerprint)
    return json({ok:false,reason:"fingerprint_mismatch"},403);
  if(!await verify(envelope,auth.public_key_pem))
    return json({ok:false,reason:"signature"},403);

  if(envelope.action==="ack"){
    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_agent_ack_command",{
      p_device_id:envelope.deviceId,
      p_command_id:envelope.commandId,
      p_ok:envelope.ok===true,
      p_reason:envelope.reason??null
    });
    if(error)return json({ok:false,reason:"ack_failed"},500);
    return json({ok:data===true});
  }

  if(envelope.action==="uninstall"){
    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_agent_uninstall_device",{
      p_device_id:envelope.deviceId
    });
    if(error)return json({ok:false,reason:"uninstall_failed"},500);
    return json({ok:data===true});
  }

  const knownId=String(envelope.knownSessionId||"");
  const knownRevision=Number(envelope.knownRevision||0);

  for(let attempt=0;attempt<20;attempt++){
    const[{data:sessionData,error:sessionError},{data:commandData,error:commandError}]=await Promise.all([
      ctx.supabaseAdmin.rpc("laser_internal_agent_remote_session",{p_device_id:envelope.deviceId}),
      ctx.supabaseAdmin.rpc("laser_internal_agent_next_session_command",{p_device_id:envelope.deviceId})
    ]);
    if(sessionError)return json({ok:false,reason:"session_poll_failed"},500);
    if(commandError)return json({ok:false,reason:"command_poll_failed"},500);

    const session=normalizeSession(sessionData);
    const command=normalizeCommand(commandData);
    if(command)return json({ok:true,session,command});

    const changed=
      (!session&&knownId.length>0)
      ||(session&&(session.id!==knownId||session.revision!==knownRevision));
    if(changed)return json({ok:true,session,command:null});

    if(attempt<19)await new Promise(resolve=>setTimeout(resolve,500));
  }

  const{data:latest}=await ctx.supabaseAdmin.rpc("laser_internal_agent_remote_session",{
    p_device_id:envelope.deviceId
  });
  return json({ok:true,session:normalizeSession(latest),command:null});
}));
