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

  return <main style={{
    minHeight:'100vh',
    padding:'20px 0 48px',
    background:'radial-gradient(circle at 16% 0%,rgba(67,112,148,.16),transparent 34%), radial-gradient(circle at 88% 8%,rgba(95,86,156,.10),transparent 30%), linear-gradient(180deg,#0d151f 0%,#09111a 58%,#0c141d 100%)'
  }}>
    {access.isAdmin&&<div style={{width:'min(1720px,calc(100% - 24px))',margin:'0 auto'}}>
      <SiteVisibilityAdminCard/>
    </div>}
    <LaserControlWorkspace/>
  </main>;
}
