import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getPublicSiteVisibility} from '@/features/site-visibility/server';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';
import {LaserGuideContent} from './LaserGuideContent';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Guia | DevinX Laser Control'},
  description:'Guia completo do DevinX Laser Control e do DevinX Laser Agent para LightBurn.',
  keywords:['guia LightBurn','DevinX Laser Control','Laser Agent','controle remoto LightBurn'],
  alternates:{canonical:'https://devinx.com.br/laser-control/guia'},
  openGraph:{
    title:'Guia | DevinX Laser Control',
    description:'Guia completo do DevinX Laser Control e do DevinX Laser Agent para LightBurn.',
    url:'https://devinx.com.br/laser-control/guia',
    siteName:'DEVINX',
    locale:'pt_BR',
    type:'website',
    images:[{
      url:'https://devinx.com.br/opengraph-image',
      width:1200,
      height:630,
      alt:'Guia do DevinX Laser Control'
    }]
  },
  twitter:{
    card:'summary_large_image',
    title:'Guia | DevinX Laser Control',
    description:'Guia completo do DevinX Laser Control e do DevinX Laser Agent para LightBurn.',
    images:['https://devinx.com.br/opengraph-image']
  }
};

export default async function LaserGuidePage(){
  const visibility=await getPublicSiteVisibility();
  if(!visibility.laser){
    const access=await getLaserMasterAccess();
    if(!access.allowed)notFound();
  }
  return <LaserGuideContent/>;
}
