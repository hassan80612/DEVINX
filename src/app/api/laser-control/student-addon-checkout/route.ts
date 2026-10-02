import {NextRequest,NextResponse} from 'next/server';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

const BR_CHECKOUT='https://pay.kiwify.com.br/2Td87KB?src=devinx_student_addon';
const INTL_CHECKOUT='https://pay.kiwify.com/2sFxGp1?src=devinx_student_addon&region=intl';

export async function GET(request:NextRequest){
  const access=await getLaserControlAccess();
  if(!access.authenticated)
    return NextResponse.redirect(new URL('/entrar?next=/laser-control',request.url),307);

  if(!access.ownerAccess||access.planId!=='control')
    return NextResponse.redirect(new URL('/laser-control?student_addon=control_only',request.url),307);

  const intl=request.nextUrl.searchParams.get('region')==='intl';
  return NextResponse.redirect(intl?INTL_CHECKOUT:BR_CHECKOUT,307);
}
