'use server';

import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {createServerSupabaseClient} from '@/lib/supabase/server';

export type AuthState={kind:'idle'|'error'|'success';message:string};
export const initialAuthState:AuthState={kind:'idle',message:''};

function normalizeEmail(value:FormDataEntryValue|null){
  return typeof value==='string'?value.trim().toLowerCase():'';
}

function safeNext(value:FormDataEntryValue|null){
  return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')?value:null;
}

function friendlyError(message:string):string{
  const lower=message.toLowerCase();
  if(lower.includes('invalid login credentials'))return'E-mail ou senha não conferem. Confira a senha exibindo-a antes de tentar novamente.';
  if(lower.includes('email not confirmed'))return'Seu e-mail ainda não foi confirmado.';
  if(lower.includes('user already registered'))return'Já existe uma conta com este e-mail.';
  if(lower.includes('password should be'))return'A senha não atende aos requisitos mínimos.';
  if(lower.includes('rate limit'))return'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  return'Não foi possível concluir agora. Tente novamente.';
}

export async function login(_previous:AuthState,formData:FormData):Promise<AuthState>{
  const email=normalizeEmail(formData.get('email'));
  const password=String(formData.get('password')||'');
  if(!email||password.length<6)return{kind:'error',message:'Confira o e-mail e a senha.'};

  const supabase=await createServerSupabaseClient();
  const{data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error||!data.user)return{kind:'error',message:friendlyError(error?.message||'auth failed')};

  const{data:profile}=await supabase.from('profiles').select('onboarded_at').eq('id',data.user.id).maybeSingle();
  const destination=profile?.onboarded_at?(safeNext(formData.get('next'))||'/painel'):'/onboarding';
  revalidatePath('/','layout');
  redirect(destination);
}

export async function signup(_previous:AuthState,formData:FormData):Promise<AuthState>{
  const email=normalizeEmail(formData.get('email'));
  const password=String(formData.get('password')||'');
  const confirmation=String(formData.get('confirmPassword')||'');
  if(!email||password.length<6)return{kind:'error',message:'Use um e-mail válido e uma senha com pelo menos 6 caracteres.'};
  if(password!==confirmation)return{kind:'error',message:'As duas senhas precisam ser iguais.'};

  const supabase=await createServerSupabaseClient();
  const{data,error}=await supabase.auth.signUp({email,password});
  if(error||!data.user)return{kind:'error',message:friendlyError(error?.message||'signup failed')};
  if(!data.session)return{kind:'error',message:'A confirmação de e-mail ainda está ativa no Supabase. Desative-a para o cadastro entrar direto, como planejado.'};

  revalidatePath('/','layout');
  redirect('/onboarding');
}

export async function recoverPassword(_previous:AuthState,formData:FormData):Promise<AuthState>{
  const email=normalizeEmail(formData.get('email'));
  if(!email)return{kind:'error',message:'Informe seu e-mail.'};

  const requestHeaders=await headers();
  const host=requestHeaders.get('x-forwarded-host')||requestHeaders.get('host')||'devinx.com.br';
  const protocol=requestHeaders.get('x-forwarded-proto')||'https';
  const origin=`${protocol}://${host}`;
  const supabase=await createServerSupabaseClient();
  const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/confirm?next=/redefinir-senha`});
  if(error)return{kind:'error',message:friendlyError(error.message)};
  return{kind:'success',message:'Se o e-mail estiver cadastrado, você receberá o link para criar uma nova senha.'};
}
