import {NextResponse} from 'next/server';
import {rpc,setSession} from '../_shared';
export async function POST(req:Request){
  const body=await req.json().catch(()=>({}));const email=String(body?.email||'').trim().toLowerCase(),password=String(body?.password||'');
  if(!email||password.length<8)return NextResponse.json({ok:false,error:'Preencha e-mail e senha.'},{status:400});
  const r=await rpc('sentinel_auth_login',{p_email:email,p_password:password});const j=await r.json().catch(()=>({ok:false,error:'login_invalido'}));
  if(!r.ok||j?.ok===false||!j?.token)return NextResponse.json({ok:false,error:'E-mail ou senha inválidos.'},{status:401});
  const res=NextResponse.json({ok:true,account:j.account});setSession(res,String(j.token));return res;
}
