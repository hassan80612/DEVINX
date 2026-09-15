import {NextRequest,NextResponse} from 'next/server';
import type {EmailOtpType} from '@supabase/supabase-js';
import {createServerSupabaseClient} from '@/lib/supabase/server';

function safeNext(value:string|null){
  return value&&value.startsWith('/')&&!value.startsWith('//')?value:'/painel';
}

export async function GET(request:NextRequest){
  const url=new URL(request.url);
  const next=safeNext(url.searchParams.get('next'));
  const code=url.searchParams.get('code');
  const tokenHash=url.searchParams.get('token_hash');
  const type=url.searchParams.get('type') as EmailOtpType|null;
  const supabase=await createServerSupabaseClient();

  let errorMessage='';
  if(code){
    const{error}=await supabase.auth.exchangeCodeForSession(code);
    errorMessage=error?.message||'';
  }else if(tokenHash&&type){
    const{error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type});
    errorMessage=error?.message||'';
  }else{
    errorMessage='missing auth token';
  }

  if(errorMessage){
    const target=new URL('/entrar',url.origin);
    target.searchParams.set('erro','link-invalido');
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(new URL(next,url.origin));
}
