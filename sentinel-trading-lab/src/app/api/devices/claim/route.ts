import {NextRequest,NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../../lib/supabase-config';

export async function POST(req:NextRequest){
  const token=req.cookies.get(SESSION_COOKIE)?.value||'';
  if(!token)return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
  const body=await req.json().catch(()=>({}));
  const replaceExisting=body?.replaceExisting===true;
  const rpc=replaceExisting?'sentinel_replace_device':'sentinel_claim_device';
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`,{
    method:'POST',
    headers:{'content-type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},
    body:JSON.stringify({p_session_token:token,p_pairing_code:String(body?.code||'').trim().toUpperCase()}),
    cache:'no-store'
  });
  const j=await r.json().catch(()=>({ok:false,error:'pair_failed'}));
  if(!r.ok||j?.ok===false)return NextResponse.json({ok:false,error:j?.error||'pair_failed'},{status:j?.error==='unauthorized'?401:400});
  return NextResponse.json({ok:true,deviceId:j.deviceId,replaced:!!j.replaced,replacedDeviceId:j.replacedDeviceId||null});
}
