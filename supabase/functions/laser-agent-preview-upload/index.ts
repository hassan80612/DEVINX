import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {withSupabase} from "npm:@supabase/server";
import {verifyPreviewSignature} from "../_shared/laser-preview.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64=/^[0-9a-f]{64}$/;
const BUCKET="devinx-laser-preview";

function json(body:unknown,status=200){
  return Response.json(body,{status,headers:{
    "Cache-Control":"no-store, max-age=0",
    "X-Content-Type-Options":"nosniff"
  }});
}

Deno.serve(withSupabase({auth:"none"},async(req,ctx)=>{
  if(req.method!=="POST")return json({accepted:false,reason:"method_not_allowed"},405);

  const contentLength=Number(req.headers.get("content-length")||"0");
  if(contentLength<1||contentLength>500000)return json({accepted:false,reason:"payload_size"},413);
  if((req.headers.get("content-type")||"").split(";")[0].trim().toLowerCase()!=="image/jpeg")
    return json({accepted:false,reason:"content_type"},415);

  const deviceId=String(req.headers.get("x-devinx-device-id")||"");
  const fingerprint=String(req.headers.get("x-devinx-fingerprint")||"").toLowerCase();
  const sentAt=Number(req.headers.get("x-devinx-sent-at")||"0");
  const capturedAt=Number(req.headers.get("x-devinx-captured-at")||"0");
  const width=Number(req.headers.get("x-devinx-width")||"0");
  const height=Number(req.headers.get("x-devinx-height")||"0");
  const signatureBase64=String(req.headers.get("x-devinx-signature")||"");

  const now=Math.floor(Date.now()/1000);
  if(!UUID.test(deviceId)||!HEX64.test(fingerprint)
    ||!Number.isSafeInteger(sentAt)||Math.abs(now-sentAt)>90
    ||!Number.isSafeInteger(capturedAt)||Math.abs(now-capturedAt)>120
    ||!Number.isSafeInteger(width)||width<1||width>4096
    ||!Number.isSafeInteger(height)||height<1||height>4096
    ||signatureBase64.length<60||signatureBase64.length>128)
    return json({accepted:false,reason:"headers"},400);

  const{data:authData,error:authError}=await ctx.supabaseAdmin.rpc("laser_internal_device_auth_context",{
    p_device_id:deviceId
  });
  if(authError)return json({accepted:false,reason:"auth_context_failed"},500);
  const auth=Array.isArray(authData)?authData[0]:authData;
  if(!auth)return json({accepted:false,reason:"unknown_device"},404);
  if(auth.device_status!=="active")return json({accepted:false,reason:"device_not_active"},403);
  if(auth.public_key_fingerprint!==fingerprint)return json({accepted:false,reason:"fingerprint_mismatch"},403);

  const{data:requestData,error:requestError}=await ctx.supabaseAdmin.rpc("laser_internal_preview_request_state",{
    p_device_id:deviceId
  });
  if(requestError)return json({accepted:false,reason:"preview_state_failed"},500);
  const requestState=Array.isArray(requestData)?requestData[0]:requestData;
  if(!requestState?.active)return json({accepted:false,reason:"preview_not_requested"},409);

  const bytes=new Uint8Array(await req.arrayBuffer());
  if(bytes.byteLength<100||bytes.byteLength>500000)return json({accepted:false,reason:"payload_size"},413);

  const signatureOk=await verifyPreviewSignature({
    deviceId,fingerprint,sentAt,capturedAt,width,height,bytes,signatureBase64,
    publicKeyPem:auth.public_key_pem
  });
  if(!signatureOk)return json({accepted:false,reason:"signature"},403);

  const path=deviceId+"/latest.jpg";
  const{error:uploadError}=await ctx.supabaseAdmin.storage
    .from(BUCKET)
    .upload(path,bytes,{contentType:"image/jpeg",cacheControl:"0",upsert:true});
  if(uploadError)return json({accepted:false,reason:"upload_failed"},500);

  const capturedIso=new Date(capturedAt*1000).toISOString();
  const{data:version,error:recordError}=await ctx.supabaseAdmin.rpc("laser_internal_record_preview_frame",{
    p_device_id:deviceId,
    p_width:width,
    p_height:height,
    p_byte_size:bytes.byteLength,
    p_captured_at:capturedIso
  });
  if(recordError)return json({accepted:false,reason:"frame_record_failed"},500);

  return json({accepted:true,frameVersion:Number(version||0)});
}));
