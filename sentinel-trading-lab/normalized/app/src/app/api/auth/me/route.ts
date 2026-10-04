import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../../lib/supabase-config';
export async function GET(req:NextRequest){
  const token=req.cookies.get(SESSION_COOKIE)?.value||'';if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/sentinel_auth_me`,{method:'POST',headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},body:JSON.stringify({p_session_token:token}),cache:'no-store'});const j=await r.json().catch(()=>({ok:false,error:'unauthorized'}));
  if(!r.ok||j?.ok===false||!j?.account)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const a=j.account;return NextResponse.json({ok:true,user:{id:a.id,email:a.email},profile:{role:a.role,plan:a.plan,max_devices:a.maxDevices}},{headers:{'cache-control':'no-store'}});
}
