import {NextRequest,NextResponse} from 'next/server';
import {SESSION_COOKIE} from '../../lib/supabase-config';
import {rpc} from '../api/auth/_shared';

// One visible "Buy 30-day access" button: no intermediary plan page.
// Anonymous visitors create a paid account first. Already authenticated
// visitors go directly to the verified Kiwify checkout.
export async function GET(req:NextRequest){
 const market=req.nextUrl.searchParams.get('market')==='INTL'?'INTL':'BR';
 const next='/api/checkout?market='+market;
 const token=req.cookies.get(SESSION_COOKIE)?.value||'';
 if(token){
  try{
   const r=await rpc('sentinel_auth_me',{p_session_token:token});
   const j=await r.json().catch(()=>null);
   if(r.ok&&j?.ok===true&&j?.account)
    return NextResponse.redirect(new URL(next,req.url));
  }catch{}
 }
 const u=new URL('/login',req.url);
 u.searchParams.set('mode','register');
 u.searchParams.set('next',next);
 return NextResponse.redirect(u);
}
