import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {LaserLanding} from "@/components/LaserLanding";
import {getPublicSiteVisibility} from "@/features/site-visibility/server";
import {getLaserMasterAccess} from "@/features/laser-control/server/master-access";

export const dynamic="force-dynamic";

export const metadata:Metadata={
  title:{absolute:"Laser Control | DevinX"},
  description:"Controle remoto do LightBurn, tela ao vivo e mentoria temporária professor-aluno com DevinX Laser Control."
};

export default async function LaserLandingPage(){
  const visibility=await getPublicSiteVisibility();
  if(!visibility.laser){
    const access=await getLaserMasterAccess();
    if(!access.allowed)notFound();
  }
  return <LaserLanding/>;
}
