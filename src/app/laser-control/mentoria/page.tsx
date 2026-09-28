import type {Metadata} from 'next';
import {MentorDownloadPage} from './MentorDownloadPage';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Acesso temporário | DevinX Laser Control'},
  description:'Acesso temporário para mentoria e suporte no DevinX Laser Control.',
  robots:{index:false,follow:false,nocache:true}
};

export default function LaserMentorPage(){
  return <MentorDownloadPage/>;
}
