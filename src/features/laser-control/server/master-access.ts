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


export async function getLaserControlAccess(){
  const supabase=await createServerSupabaseClient();
  const{data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  const userId=claimsData?.claims?.sub;

  if(claimsError||!userId)return {
    authenticated:false,allowed:false,isAdmin:false,ownerAccess:false,mentorAccess:false,
    planId:null as string|null,mentorBillingMode:'disabled',mentorMaxConcurrent:1
  };

  const{data,error}=await supabase.rpc('get_laser_access_status');
  const row=Array.isArray(data)?data[0]:data;
  if(error||!row)return {
    authenticated:true,allowed:false,isAdmin:false,ownerAccess:false,mentorAccess:false,
    planId:null as string|null,mentorBillingMode:'disabled',mentorMaxConcurrent:1
  };

  const isAdmin=Boolean(row.is_admin);
  const ownerAccess=Boolean(row.owner_access);
  const mentorAccess=Boolean(row.mentor_access);
  return {
    authenticated:true,
    allowed:isAdmin||ownerAccess||mentorAccess,
    isAdmin,
    ownerAccess,
    mentorAccess,
    planId:typeof row.plan_id==='string'?row.plan_id:null,
    mentorBillingMode:String(row.mentor_billing_mode||'disabled'),
    mentorMaxConcurrent:Number(row.mentor_max_concurrent||1)
  };
}
