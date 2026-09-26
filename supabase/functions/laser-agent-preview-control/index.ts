import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {withSupabase} from "npm:@supabase/server";
import {
  validateAgentControlEnvelope,
  verifyAgentControlSignature,
  type AgentControlEnvelope
} from "../_shared/laser-agent-control.ts";

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{
    "Cache-Control":"no-store, max-age=0",
    "X-Content-Type-Options":"nosniff"
  }});
}

Deno.serve(withSupabase({auth:"none"},async(req,ctx)=>{
  if(req.method!=="POST")return json({ok:false,reason:"method_not_allowed"},405);
  const len=Number(req.headers.get("content-length")||"0");
  if(len>12000)return json({ok:false,reason:"payload_too_large"},413);

  let envelope:AgentControlEnvelope;
  try{envelope=await req.json() as AgentControlEnvelope}
  catch{return json({ok:false,reason:"invalid_json"},400)}

  const invalid=validateAgentControlEnvelope(envelope);
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

  const signatureOk=await verifyAgentControlSignature(envelope,auth.public_key_pem);
  if(!signatureOk)return json({ok:false,reason:"signature"},403);

  if(envelope.action==="arm"){
    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_agent_set_local_arm",{
      p_device_id:envelope.deviceId,
      p_enabled:envelope.enabled===true
    });
    if(error)return json({ok:false,reason:"arm_failed"},500);
    return json({ok:true,enabled:envelope.enabled===true,localArmUntil:data??null});
  }

  const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_preview_control_state",{
    p_device_id:envelope.deviceId,
    p_after_seq:Number(envelope.afterSeq||0)
  });
  if(error)return json({ok:false,reason:"poll_failed"},500);

  const row=Array.isArray(data)?data[0]:data;
  if(!row)return json({ok:false,reason:"device_not_active"},403);

  return json({
    ok:true,
    previewActive:Boolean(row.preview_active),
    touchEnabled:Boolean(row.touch_enabled),
    localArmUntil:row.local_arm_until??null,
    eventSeq:Number(row.event_seq||0),
    touchEvent:row.touch_event??null,
    touchEventAt:row.touch_event_at??null
  });
}));
