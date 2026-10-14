import {NextRequest,NextResponse} from 'next/server';
import {rpc} from '../_shared';
import {SESSION_COOKIE} from '../../../../lib/supabase-config';

// This request comes from an authenticated, open Sentinel tab. The cookie
// remains httpOnly; the browser never holds the raw Agent/device secret.
export async function POST(req:NextRequest){
 const origin=req.headers.get('origin');
 if(origin&&new URL(origin).host!==req.nextUrl.host)
   return NextResponse.json({ok:false,error:'invalid_origin'},{status:403});
 const token=req.cookies.get(SESSION_COOKIE)?.value||'';
 if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
 try{
  const r=await rpc('sentinel_web_presence',{p_session_token:token});
  const data=await r.json().catch(()=>({ok:false}));
  if(!r.ok||data?.ok!==true)return NextResponse.json({ok:false,error:'unauthorized'},{status:401,headers:{'cache-control':'no-store'}});
  return NextResponse.json({ok:true},{headers:{'cache-control':'no-store'}});
 }catch{return NextResponse.json({ok:false,error:'session_check_failed'},{status:503,headers:{'cache-control':'no-store'}})}
}
