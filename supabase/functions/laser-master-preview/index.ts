import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {requireLaserMaster} from "../_shared/laser-user-auth.ts";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUCKET="devinx-laser-preview";

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

  let body:{action?:string;deviceId?:string;active?:boolean;knownVersion?:number};
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}

  const deviceId=String(body.deviceId||"");
  if(!UUID.test(deviceId))return json({error:"invalid_device"},400);

  if(body.action==="session"){
    const active=body.active===true;
    const{data,error}=await ctx.admin.rpc("laser_internal_set_preview_request",{
      p_user_id:ctx.userId,
      p_device_id:deviceId,
      p_active:active
    });
    if(error){
      const msg=String(error.message||"");
      return msg.includes("preview_device_not_found")
        ?json({error:"not_found"},404)
        :json({error:"preview_session_failed"},500);
    }
    const row=Array.isArray(data)?data[0]:data;
    return json({active:Boolean(row?.active),requestedUntil:row?.requested_until??null});
  }

  if(body.action==="meta"){
    const knownVersion=Number.isSafeInteger(body.knownVersion)?Number(body.knownVersion):0;
    const{data,error}=await ctx.admin.rpc("laser_internal_preview_meta",{
      p_user_id:ctx.userId,
      p_device_id:deviceId
    });
    if(error){
      const msg=String(error.message||"");
      return msg.includes("preview_device_not_found")
        ?json({error:"not_found"},404)
        :json({error:"preview_meta_failed"},500);
    }

    const row=Array.isArray(data)?data[0]:data;
    if(!row)return json({error:"not_found"},404);
    const version=Number(row.frame_version||0);
    const response:any={
      active:Boolean(row.active),
      requestedUntil:row.requested_until??null,
      lastFrameAt:row.last_frame_at??null,
      frameVersion:version,
      width:row.frame_width??null,
      height:row.frame_height??null,
      byteSize:row.frame_byte_size??null,
      unchanged:version<=knownVersion
    };

    if(version>knownVersion&&row.last_frame_at){
      const{data:signed,error:signedError}=await ctx.admin.storage
        .from(BUCKET)
        .createSignedUrl(deviceId+"/latest.jpg",30);
      if(!signedError&&signed?.signedUrl)response.signedUrl=signed.signedUrl;
    }

    return json(response);
  }

  return json({error:"invalid_action"},400);
});
