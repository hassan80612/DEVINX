import type {Metadata} from "next";
import {HomeHub} from "@/components/HomeHub";

export const metadata:Metadata={
  title:{absolute:"DevinX | Você no controle"},
  description:"Escolha o que mantém você no controle: organize suas finanças com o DevinX Financeiro ou sua operação com a DevinX Loja.",
  alternates:{canonical:"/"},
  openGraph:{title:"DevinX | Você no controle",description:"Finanças, trabalho ou negócio: escolha o DevinX que faz sentido para a sua rotina.",url:"https://devinx.com.br",siteName:"DEVINX",type:"website"}
};

export default function Home(){return <HomeHub/>;}
