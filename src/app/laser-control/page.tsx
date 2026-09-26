import type {Metadata} from 'next';
import {LaserControlLanding} from '@/components/LaserControlLanding';

export const metadata:Metadata={
  title:{absolute:'DevinX Laser Control | Controle seu LightBurn pelo celular'},
  description:'Painel móvel seguro para acompanhar e controlar fluxos do LightBurn por meio de um Agent local limitado e pareado.',
  alternates:{canonical:'/laser-control'},
  robots:{index:false,follow:false}
};

export default function LaserControlPage(){
  return <LaserControlLanding/>;
}
