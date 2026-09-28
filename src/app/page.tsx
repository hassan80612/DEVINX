import './hub.css';
import './theme.css';
import type {Metadata} from "next";
import {HomeHub} from "@/components/HomeHub";

export const metadata:Metadata={
  title:{absolute:"DevinX | Você no controle"},
  description:"Escolha o DevinX para sua rotina: controle financeiro, gestão de loja ou controle remoto do LightBurn com o Laser Control.",
  alternates:{canonical:"/"},
  openGraph:{title:"DevinX | Você no controle",description:"Finanças, loja e controle remoto do LightBurn em produtos independentes para sua rotina.",url:"https://devinx.com.br",siteName:"DEVINX",type:"website"},
  twitter:{card:"summary_large_image",title:"DevinX | Você no controle",description:"Financeiro, Loja e Laser Control: escolha o produto DevinX que faz sentido para sua rotina."}
};

export default function Home(){return <HomeHub/>;}
