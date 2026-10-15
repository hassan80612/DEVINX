import {NextResponse} from 'next/server';

export const dynamic='force-dynamic';

// Temporary preview-only server-side diagnostic. Never serves secrets or user data.
export async function GET(){
  if(process.env.VERCEL_ENV!=='preview')return new NextResponse(null,{status:404});
  const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!origin||!apikey)return NextResponse.json({error:'unconfigured'},{status:500});
  const targets=[
    ['authHealth','/auth/v1/health','GET'],
    ['authSettings','/auth/v1/settings','GET'],
    ['publicRpc','/rest/v1/rpc/get_public_site_visibility','POST']
  ] as const;
  const results=await Promise.all(targets.map(async ([name,path,method])=>{
    try{
      const response=await fetch(origin+path,{
        method,
        headers:{apikey,Authorization:'Bearer '+apikey,'Content-Type':'application/json'},
        body:method==='POST'?'{}':undefined,
        cache:'no-store',
        signal:AbortSignal.timeout(9000)
      });
      const body=await response.text();
      const codeMatch=body.match(/exceed_egress_quota|quota_exceeded|quota|not_found|invalid_api_key|invalid_jwt|permission_denied|unauthorized/i);
      return {name,status:response.status,ok:response.ok,errorCategory:codeMatch?.[0]?.toLowerCase()||null};
    }catch(error){
      return {name,status:null,ok:false,errorCategory:error instanceof Error?error.name:'network_error'};
    }
  }));
  return NextResponse.json({results},{headers:{'Cache-Control':'no-store'}});
}
