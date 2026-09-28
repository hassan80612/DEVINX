import {NextRequest,NextResponse} from 'next/server';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

const AGENT_DOWNLOAD='https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.33/DevinX-Laser-Agent-1.0.33.exe';

export async function GET(request:NextRequest){
  const access=await getLaserControlAccess();
  if(!access.authenticated)
    return NextResponse.redirect(new URL('/entrar?next=/laser-control',request.url),307);
  if(!access.isAdmin&&!access.ownerAccess)
    return NextResponse.redirect(new URL('/laser-control/conhecer?acesso=necessario#planos',request.url),307);

  return NextResponse.redirect(AGENT_DOWNLOAD,307);
}
