import {NextRequest,NextResponse} from 'next/server';
import {createServerSupabaseClient} from '@/lib/supabase/server';

type AuthAction='login'|'signup';

function normalizeEmail(value:unknown){
  return typeof value==='string'?value.trim().toLowerCase():'';
}

function safeNext(value:unknown){
  return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')?value:null;
}

function friendlyError(message:string){
  const lower=message.toLowerCase();
  if(lower.includes('invalid login credentials'))return'E-mail ou senha não conferem.';
  if(lower.includes('email not confirmed'))return'Seu e-mail ainda não foi confirmado.';
  if(lower.includes('user already registered'))return'Já existe uma conta com este e-mail.';
  if(lower.includes('password should be'))return'A senha não atende aos requisitos mínimos.';
  if(lower.includes('rate limit'))return'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  return'Não foi possível concluir o acesso agora.';
}

export async function POST(request:NextRequest){
  const body=await request.json().catch(()=>null) as {action?:AuthAction;email?:string;password?:string;next?:string}|null;
  if(!body||!['login','signup'].includes(body.action||''))return NextResponse.json({ok:false,message:'Solicitação inválida.'},{status:400});
  const email=normalizeEmail(body.email);
  const password=typeof body.password==='string'?body.password:'';
  if(!email||password.length<6)return NextResponse.json({ok:false,message:'Confira o e-mail e a senha.'},{status:400});

  const supabase=await createServerSupabaseClient();
  const response=body.action==='login'
    ?await supabase.auth.signInWithPassword({email,password})
    :await supabase.auth.signUp({email,password});

  if(response.error)return NextResponse.json({ok:false,message:friendlyError(response.error.message),code:response.error.code||null},{status:401});
  const user=response.data.user;
  if(!user)return NextResponse.json({ok:false,message:'Não foi possível concluir o acesso.'},{status:401});
  if(body.action==='signup'&&!response.data.session)return NextResponse.json({ok:false,requiresConfirmation:true,message:'A confirmação por e-mail ainda está ativa no Supabase.'},{status:409});

  const{data:profile}=await supabase.from('profiles').select('onboarded_at').eq('id',user.id).maybeSingle();
  const destination=profile?.onboarded_at?(safeNext(body.next)||'/painel'):'/onboarding';
  return NextResponse.json({ok:true,destination},{headers:{'Cache-Control':'no-store'}});
}
