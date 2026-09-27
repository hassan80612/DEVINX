import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {withSupabase} from "npm:@supabase/server";
import {laserJson,verifyMentorProof,type MentorProof} from "../_shared/laser-mentor.ts";
export default {fetch:withSupabase({auth:"none"},async(req,ctx)=>{
 if(req.method!=="POST")return laserJson({error:"method_not_allowed"},405);
 let proof:MentorProof;try{proof=await req.json() as MentorProof}catch{return laserJson({error:"invalid_json"},400)}
 const failure=await verifyMentorProof(proof);if(failure)return laserJson({error:"invalid_proof",reason:failure},400);
 const{data,error}=await ctx.supabaseAdmin.rpc("laser_internal_mentor_status",{p_device_id:proof.deviceId,p_public_key_fingerprint:proof.publicKeyFingerprint});
 if(error)return laserJson({error:"status_failed"},500);
 const row=Array.isArray(data)?data[0]:data;
 return laserJson({paired:Boolean(row?.paired),deviceStatus:row?.device_status??null,offerPending:Boolean(row?.offer_pending),sessionActive:Boolean(row?.session_active),sessionExpiresAt:row?.session_expires_at??null});
})};