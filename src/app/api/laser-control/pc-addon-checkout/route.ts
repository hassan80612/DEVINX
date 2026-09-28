import {NextRequest,NextResponse} from 'next/server';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

const BR_CHECKOUT='https://pay.kiwify.com.br/IdNEzcp?src=devinx_extra_pc';
const INTL_CHECKOUT='https://pay.kiwify.com/PR4BNpa?src=devinx_extra_pc&region=intl';

export async function GET(request:NextRequest){
  const access=await getLaserControlAccess();
  if(!access.authenticated)
    return NextResponse.redirect(new URL('/entrar?next=/laser-control',request.url),307);

  if(!access.isAdmin&&!access.ownerAccess)
    return NextResponse.redirect(new URL('/laser-control/conhecer?acesso=necessario#planos',request.url),307);

  const intl=request.nextUrl.searchParams.get('region')==='intl';
  return NextResponse.redirect(intl?INTL_CHECKOUT:BR_CHECKOUT,307);
}
