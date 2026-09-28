import type {Metadata} from 'next';
import {MentorDownloadPage} from './MentorDownloadPage';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:{absolute:'Acesso temporário | DevinX Laser Control'},
  description:'Acesso temporário para mentoria e suporte no DevinX Laser Control.',
  alternates:{canonical:'https://devinx.com.br/laser-control/mentoria'},
  robots:{index:false,follow:false,nocache:true},
  openGraph:{
    title:'Acesso temporário | DevinX Laser Control',
    description:'Acesso temporário para mentoria e suporte no DevinX Laser Control.',
    url:'https://devinx.com.br/laser-control/mentoria',
    siteName:'DEVINX',
    locale:'pt_BR',
    type:'website',
    images:[{
      url:'https://devinx.com.br/opengraph-image',
      width:1200,
      height:630,
      alt:'DevinX Laser Control'
    }]
  },
  twitter:{
    card:'summary_large_image',
    title:'Acesso temporário | DevinX Laser Control',
    description:'Acesso temporário para mentoria e suporte no DevinX Laser Control.',
    images:['https://devinx.com.br/opengraph-image']
  }
};

export default function LaserMentorPage(){
  return <MentorDownloadPage/>;
}
