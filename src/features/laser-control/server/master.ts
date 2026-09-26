import {createServerSupabaseClient} from '@/lib/supabase/server';

function laserMasterSurfaceEnabled(){
  if(process.env.VERCEL_ENV==='preview')return true;
  return process.env.LASER_CONTROL_MASTER_ENABLED==='true';
}

export async function getLaserControlMasterSession(){
  if(!laserMasterSurfaceEnabled())return null;

  const supabase=await createServerSupabaseClient();
  const{data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  const userId=claimsData?.claims?.sub;

  if(claimsError||!userId)return null;

  const{data:accessData,error:accessError}=await supabase.rpc('get_devinx_access_status');
  if(accessError)return null;

  const access=Array.isArray(accessData)?accessData[0]:accessData;
  if(!access?.allowed||!access?.is_admin)return null;

  return {supabase,userId,access};
}
