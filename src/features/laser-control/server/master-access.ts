import {createServerSupabaseClient} from '@/lib/supabase/server';

export async function getLaserMasterAccess(){
  const supabase=await createServerSupabaseClient();
  const{data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  const userId=claimsData?.claims?.sub;

  if(claimsError||!userId)return {authenticated:false,allowed:false};

  const{data,error}=await supabase.rpc('get_devinx_access_status');
  if(error)return {authenticated:true,allowed:false};

  const access=Array.isArray(data)?data[0]:data;
  return {
    authenticated:true,
    allowed:Boolean(access?.allowed&&access?.is_admin)
  };
}
