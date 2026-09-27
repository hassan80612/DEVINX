import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {LaserControlWorkspace} from '@/components/LaserControlWorkspace';
import {SiteVisibilityAdminCard} from '@/components/SiteVisibilityAdminCard';
import {getLaserControlAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Laser Control | DevinX'},
  description:'Controle remoto LightBurn e mentoria DevinX.',
  robots:{index:false,follow:false,nocache:true}
};

export default async function LaserControlPage(){
  const access=await getLaserControlAccess();
  if(!access.authenticated)redirect('/entrar?next=/laser-control');
  if(!access.allowed)notFound();

  return <main style={{minHeight:'100vh',padding:'20px 0 48px',background:'#05080d'}}>
    {access.isAdmin&&<div style={{width:'min(1720px,calc(100% - 24px))',margin:'0 auto'}}>
      <SiteVisibilityAdminCard/>
    </div>}
    <LaserControlWorkspace/>
  </main>;
}
