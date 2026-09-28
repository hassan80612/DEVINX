import {redirect} from 'next/navigation';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

function marketOf(value:string|string[]|undefined){
  const raw=Array.isArray(value)?value[0]:value;
  return raw==='intl'?'intl':'br';
}

export default async function LaserExtraSessionsPage({
  searchParams
}:{searchParams:Promise<{market?:string|string[]}>}){
  const params=await searchParams;
  const market=marketOf(params.market);
  const access=await getLaserControlAccess();

  if(!access.authenticated){
    redirect('/entrar?next='+encodeURIComponent('/laser-control/extra?market='+market));
  }

  if(!access.mentorAccess&&!access.isAdmin){
    redirect('/laser-control/conhecer?extra=mentor#planos');
  }

  redirect(market==='intl'
    ?'https://pay.kiwify.com/2sFxGp1'
    :'https://pay.kiwify.com.br/2Td87KB'
  );
}
