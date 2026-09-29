import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {LaserControlWorkspace} from '@/components/LaserControlWorkspace';
import {LaserAdminPanel} from '@/components/LaserAdminPanel';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';
import {LaserAccessGate} from '@/components/LaserAccessGate';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Laser Control | DevinX'},
  description:'Controle remoto LightBurn e mentoria DevinX.',
  robots:{index:false,follow:false,nocache:true}
};

export default async function LaserControlPage(){
  const access=await getLaserControlAccess();
  if(!access.authenticated)redirect('/entrar?next=/laser-control');
  if(!access.allowed)redirect('/laser-control/conhecer?acesso=necessario#planos');

  return <main style={{
    minHeight:'100vh',
    padding:'20px 0 48px',
    background:'radial-gradient(circle at 14% -4%,rgba(121,190,224,.22),transparent 34%), radial-gradient(circle at 90% 3%,rgba(145,129,214,.14),transparent 31%), linear-gradient(180deg,#344655 0%,#2a3b49 55%,#304250 100%)'
  }}>
    {access.isAdmin&&<LaserAdminPanel/>}
    <LaserControlWorkspace/>
  </main>;
}
