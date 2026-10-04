import {NextResponse} from 'next/server';
import {rpc,setSession} from '../_shared';
export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({ok:false,error:'E-mail inválido.'},{status:400});
  if(password.length<8)return NextResponse.json({ok:false,error:'A senha precisa ter pelo menos 8 caracteres.'},{status:400});
  const r=await rpc('sentinel_auth_register',{p_email:email,p_password:password});const j=await r.json().catch(()=>({ok:false,error:'falha_criar_conta'}));
  if(!r.ok||j?.ok===false||!j?.token)return NextResponse.json({ok:false,error:j?.error==='conta_ja_existe'?'Já existe uma conta Sentinel com este e-mail.':j?.error==='senha_minimo_8'?'A senha precisa ter pelo menos 8 caracteres.':j?.error||'Não foi possível criar a conta.'},{status:400});
  const res=NextResponse.json({ok:true,account:j.account});setSession(res,String(j.token));return res;
}
