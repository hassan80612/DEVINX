import {NextRequest,NextResponse} from 'next/server';
import {rpc,clearSession} from '../_shared';
import {SESSION_COOKIE} from '../../../../lib/supabase-config';
export async function POST(req:NextRequest){
  const token=req.cookies.get(SESSION_COOKIE)?.value||'';
  if(token){
    try{
      const upstream=await rpc('sentinel_auth_logout',{p_session_token:token});
      const result=await upstream.json();
      if(!upstream.ok||result?.ok!==true)throw new Error('logout_unconfirmed');
    }catch{
      return NextResponse.json({ok:false,error:'logout_temporarily_unavailable'},{status:503});
    }
  }
  const res=NextResponse.json({ok:true});clearSession(res);return res;
}
