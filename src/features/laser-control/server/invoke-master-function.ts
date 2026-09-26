import {createServerSupabaseClient} from '@/lib/supabase/server';

const ALLOWED_FUNCTIONS=new Set([
  'laser-master-pairing-claim',
  'laser-master-devices',
  'laser-master-device-access'
]);

export async function invokeLaserMasterFunction(slug:string,body:Record<string,unknown>){
  if(!ALLOWED_FUNCTIONS.has(slug))return {ok:false,status:404,data:{error:'not_found'}};

  const supabase=await createServerSupabaseClient();
  const{data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  const userId=claimsData?.claims?.sub;
  if(claimsError||!userId)return {ok:false,status:401,data:{error:'unauthorized'}};

  const{data:accessData,error:accessError}=await supabase.rpc('get_devinx_access_status');
  const access=Array.isArray(accessData)?accessData[0]:accessData;
  if(accessError||!access?.allowed||!access?.is_admin)return {ok:false,status:404,data:{error:'not_found'}};

  // getClaims() above is the authorization check. getSession() is used only
  // to retrieve the already-validated access token for the Edge Function hop.
  const{data:sessionData}=await supabase.auth.getSession();
  const accessToken=sessionData.session?.access_token;
  if(!accessToken)return {ok:false,status:401,data:{error:'unauthorized'}};

  const base=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apiKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const response=await fetch(`${base}/functions/v1/${slug}`,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${accessToken}`,
      apikey:apiKey,
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body),
    cache:'no-store'
  });

  let data:unknown={error:'upstream_error'};
  try{data=await response.json()}catch{}
  return {ok:response.ok,status:response.status,data};
}
