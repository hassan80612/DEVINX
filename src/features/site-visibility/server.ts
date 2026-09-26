import {createServerSupabaseClient} from '@/lib/supabase/server';

export async function getPublicSiteVisibility(){
  const supabase=await createServerSupabaseClient();
  const{data,error}=await supabase.rpc('get_public_site_visibility');
  if(error)return {laser:false,finance:true};
  const row=Array.isArray(data)?data[0]:data;
  return {
    laser:Boolean(row?.laser_public_visible),
    finance:row?.finance_public_visible!==false
  };
}
