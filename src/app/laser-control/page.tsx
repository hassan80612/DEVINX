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
    background:'radial-gradient(circle at 14% -4%,rgba(121,190,224,.22),transparent 34%), radial-gradient(circle at 90% 3%,rgba(145,129,214,.14),transparent 31%), linear-gradient(180deg,#344655 0%,#2a3b49 55%,#304250 100%)'
  }}>
    {access.isAdmin&&<div style={{width:'min(1720px,calc(100% - 24px))',margin:'0 auto'}}>
      <SiteVisibilityAdminCard/>
    </div>}
    <div style={{width:'min(1720px,calc(100% - 24px))',margin:'8px auto 4px',display:'flex',justifyContent:'flex-end'}}>
      <a href="mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support&body=Agent%20version:%0ALightBurn%20version:%0AWindows:%0AIssue:%0A" style={{padding:'8px 12px',borderRadius:10,border:'1px solid rgba(170,222,240,.28)',background:'rgba(13,33,43,.48)',color:'#cceef8',fontSize:11,fontWeight:800,textDecoration:'none'}}>Suporte / Support</a>
    </div>
    <LaserControlWorkspace/>
  </main>;
}
