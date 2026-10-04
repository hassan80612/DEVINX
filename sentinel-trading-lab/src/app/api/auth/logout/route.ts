import {NextRequest,NextResponse} from 'next/server';
import {rpc,clearSession} from '../_shared';
import {SESSION_COOKIE} from '../../../../lib/supabase-config';
export async function POST(req:NextRequest){const token=req.cookies.get(SESSION_COOKIE)?.value||'';if(token)await rpc('sentinel_auth_logout',{p_session_token:token}).catch(()=>null);const res=NextResponse.json({ok:true});clearSession(res);return res}
