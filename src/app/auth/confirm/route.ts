import {NextRequest,NextResponse} from 'next/server';
import type {EmailOtpType} from '@supabase/supabase-js';
import {createServerSupabaseClient} from '@/lib/supabase/server';

function safeNext(value:string|null){return value&&value.startsWith('/')&&!value.startsWith('//')?value:'/painel'}

export async function GET(request:NextRequest){
  const url=new URL(request.url);const code=url.searchParams.get('code');const tokenHash=url.searchParams.get('token_hash');const type=url.searchParams.get('type') as EmailOtpType|null;const supabase=await createServerSupabaseClient();
  let error=null;
  if(code){({error}=await supabase.auth.exchangeCodeForSession(code))}
  else if(tokenHash&&type){({error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type}))}
  else{error={message:'missing auth token'} as never}
  if(error){const target=new URL('/entrar',url.origin);target.searchParams.set('erro','link-invalido');return NextResponse.redirect(target)}
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')),url.origin));
}
