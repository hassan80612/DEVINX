import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getPublicSiteVisibility} from '@/features/site-visibility/server';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';
import {LaserGuideContent} from './LaserGuideContent';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:'Laser Control | DevinX',
  description:'Guia completo do DevinX Laser Control e do DevinX Laser Agent para LightBurn.'
};

export default async function LaserGuidePage(){
  const visibility=await getPublicSiteVisibility();
  if(!visibility.laser){
    const access=await getLaserMasterAccess();
    if(!access.allowed)notFound();
  }
  return <LaserGuideContent/>;
}
