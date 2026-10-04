import {NextResponse} from 'next/server';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,SESSION_COOKIE} from '../../../lib/supabase-config';

export async function rpc(name:string,body:any){
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY,'authorization':`Bearer ${SUPABASE_PUBLISHABLE_KEY}`},body:JSON.stringify(body||{}),cache:'no-store'});
}
export function setSession(res:NextResponse,token:string){
  res.cookies.set(SESSION_COOKIE,token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:60*60*24*30});
}
export function clearSession(res:NextResponse){res.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0})}
