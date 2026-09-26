import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {LaserControlLanding} from '@/components/LaserControlLanding';
import {getLaserControlMasterSession} from '@/features/laser-control/server/master';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'DevinX Laser Control | Área Master'},
  description:'Área privada de desenvolvimento do DevinX Laser Control.',
  robots:{index:false,follow:false,nocache:true}
};

export default async function LaserControlPage(){
  const session=await getLaserControlMasterSession();
  if(!session)notFound();

  return <LaserControlLanding/>;
}
