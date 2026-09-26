import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import {
  decodeHeartbeatTelemetry,
  heartbeatJson,
  validateHeartbeatEnvelope,
  verifyHeartbeatSignature,
  type HeartbeatEnvelope
} from "../_shared/laser-heartbeat.ts";

export default {
  fetch: withSupabase({auth:"none"},async(req,ctx)=>{
    if(req.method!=="POST")return heartbeatJson({error:"method_not_allowed"},405);

    const contentLength=Number(req.headers.get("content-length")||"0");
    if(contentLength>30000)return heartbeatJson({accepted:false,reason:"payload_too_large"},413);

    let envelope:HeartbeatEnvelope;
    try{envelope=await req.json() as HeartbeatEnvelope}
    catch{return heartbeatJson({accepted:false,reason:"invalid_json"},400)}

    const envelopeError=validateHeartbeatEnvelope(envelope);
    if(envelopeError)return heartbeatJson({accepted:false,reason:envelopeError},400);

    const{data:authData,error:authError}=await ctx.supabaseAdmin.rpc("laser_internal_device_auth_context",{
      p_device_id:envelope.deviceId
    });
    if(authError)return heartbeatJson({accepted:false,reason:"auth_context_failed"},500);

    const auth=Array.isArray(authData)?authData[0]:authData;
    if(!auth)return heartbeatJson({accepted:false,reason:"unknown_device"},404);
    if(auth.device_status!=="active")return heartbeatJson({accepted:false,reason:"device_not_active"},403);
    if(auth.public_key_fingerprint!==envelope.publicKeyFingerprint)return heartbeatJson({accepted:false,reason:"fingerprint_mismatch"},403);
    if(envelope.sequence<=Number(auth.last_sequence||0))return heartbeatJson({accepted:false,reason:"stale_sequence"},409);

    const decoded=await decodeHeartbeatTelemetry(envelope);
    if("error" in decoded)return heartbeatJson({accepted:false,reason:decoded.error},400);

    const signatureOk=await verifyHeartbeatSignature(envelope,auth.public_key_pem,decoded.bytes);
    if(!signatureOk)return heartbeatJson({accepted:false,reason:"signature"},403);

    const telemetry=decoded.telemetry;
    const progressPermille=telemetry.progress===null
      ?null
      :Math.max(0,Math.min(1000,Math.round(telemetry.progress*10)));

    const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_accept_telemetry",{
      p_device_id:envelope.deviceId,
      p_sequence:envelope.sequence,
      p_agent_version:envelope.agentVersion,
      p_adapter:telemetry.adapter,
      p_lightburn_online:telemetry.lightBurnOnline,
      p_machine_connected:telemetry.deviceConnected,
      p_machine_name:telemetry.deviceName,
      p_job_state:telemetry.jobState,
      p_progress_permille:progressPermille,
      p_project_file:telemetry.projectFile,
      p_captured_at:telemetry.capturedAtUtc
    });

    if(error){
      const message=String(error.message||"");
      if(message.includes("stale_sequence"))return heartbeatJson({accepted:false,reason:"stale_sequence"},409);
      if(message.includes("device_not_active"))return heartbeatJson({accepted:false,reason:"device_not_active"},403);
      if(message.includes("invalid_telemetry"))return heartbeatJson({accepted:false,reason:"invalid_telemetry"},400);
      return heartbeatJson({accepted:false,reason:"storage_error"},500);
    }

    if(data!==true)return heartbeatJson({accepted:false,reason:"stale_sequence"},409);
    return heartbeatJson({accepted:true,sequence:envelope.sequence});
  })
};
