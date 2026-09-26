import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {LaserControlMasterPanel} from '@/components/LaserControlMasterPanel';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Laser Control | DevinX Master'},
  description:'Área privada de testes do Laser Control.',
  robots:{index:false,follow:false,nocache:true}
};

export default async function LaserControlPage(){
  const access=await getLaserMasterAccess();

  if(!access.authenticated)redirect('/entrar?next=/laser-control');
  if(!access.allowed)notFound();

  return <main style={{minHeight:'100vh',padding:'24px 0',background:'#090b0e'}}>
    <LaserControlMasterPanel/>
  </main>;
}
