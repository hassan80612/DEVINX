import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createServerSupabaseClient} from '@/lib/supabase/server';

export const runtime='nodejs';

const PRODUCT_ID='42a1cde0-b411-11f1-b998-436a8b692e83';
const CHECKOUT_URL='https://pay.kiwify.com.br/pf2YM64';

export async function POST(){
  const secret=process.env.KIWIFY_WEBHOOK_TOKEN;
  if(!secret)return NextResponse.json({ok:false,error:'kiwify_token_missing'},{status:503});

  const supabase=await createServerSupabaseClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});

  const{data:isAdmin,error:adminError}=await supabase.rpc('is_devinx_admin');
  if(adminError||!isAdmin)return NextResponse.json({ok:false,error:'forbidden'},{status:403});

  const tokenHash=createHash('sha256').update(secret).digest('hex');
  const{error}=await supabase.rpc('admin_sync_kiwify_integration',{
    p_token_hash:tokenHash,
    p_product_id:PRODUCT_ID,
    p_checkout_url:CHECKOUT_URL
  });
  if(error)return NextResponse.json({ok:false,error:'sync_failed'},{status:500});
  return NextResponse.json({ok:true});
}
