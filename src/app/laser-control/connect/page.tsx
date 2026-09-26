import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';
import {LaserQuickConnect} from '@/components/LaserQuickConnect';

export const dynamic='force-dynamic';
export const metadata:Metadata={
  title:{absolute:'Vincular PC | DevinX Laser Control'},
  robots:{index:false,follow:false,nocache:true}
};

function first(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value}

export default async function LaserConnectPage({searchParams}:{searchParams:Promise<{code?:string|string[];name?:string|string[]}>}){
  const access=await getLaserMasterAccess();
  const params=await searchParams;
  const code=String(first(params.code)||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
  const deviceName=String(first(params.name)||'PC Windows').trim().slice(0,80)||'PC Windows';

  if(!access.authenticated){
    const next='/laser-control/connect?code='+encodeURIComponent(code)+'&name='+encodeURIComponent(deviceName);
    redirect('/entrar?next='+encodeURIComponent(next));
  }
  if(!access.allowed)notFound();
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))redirect('/laser-control');

  return <LaserQuickConnect code={code} deviceName={deviceName}/>;
}
