import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {LaserLanding} from "@/components/LaserLanding";
import {getPublicSiteVisibility} from "@/features/site-visibility/server";
import {getLaserMasterAccess} from "@/features/laser-control/server/master-access";

export const dynamic="force-dynamic";

export const metadata:Metadata={
  title:{absolute:"DevinX Laser Control | Controle remoto do LightBurn"},
  description:"Controle remoto do LightBurn, tela ao vivo e mentoria temporária professor-aluno com DevinX Laser Control.",
  keywords:[
    "LightBurn remoto","controle remoto LightBurn","Laser Control","LightBurn pelo celular",
    "mentoria LightBurn","DevinX Laser Control"
  ],
  alternates:{canonical:"https://devinx.com.br/laser-control/conhecer"},
  openGraph:{
    title:"DevinX Laser Control | Controle remoto do LightBurn",
    description:"Controle remoto do LightBurn, tela ao vivo e mentoria temporária professor-aluno com DevinX Laser Control.",
    url:"https://devinx.com.br/laser-control/conhecer",
    siteName:"DEVINX",
    locale:"pt_BR",
    type:"website",
    images:[{
      url:"https://devinx.com.br/opengraph-image",
      width:1200,
      height:630,
      alt:"DevinX Laser Control"
    }]
  },
  twitter:{
    card:"summary_large_image",
    title:"DevinX Laser Control | Controle remoto do LightBurn",
    description:"Controle remoto do LightBurn, tela ao vivo e mentoria temporária professor-aluno.",
    images:["https://devinx.com.br/opengraph-image"]
  }
};

export default async function LaserLandingPage(){
  const visibility=await getPublicSiteVisibility();
  if(!visibility.laser){
    const access=await getLaserMasterAccess();
    if(!access.allowed)notFound();
  }
  return <LaserLanding/>;
}
