import './hub.css';
import './theme.css';
import type {Metadata} from "next";
import {HomeHub} from "@/components/HomeHub";

export const metadata:Metadata={
  title:{absolute:"DevinX | Você no controle"},
  description:"Conheça Sentinel Trading Lab, DevinX Financeiro e DevinX Loja: produtos independentes para sua rotina.",
  alternates:{canonical:"/"},
  openGraph:{title:"DevinX | Você no controle",description:"Análise de mercado, finanças e gestão de loja em produtos independentes para sua rotina.",url:"https://devinx.com.br",siteName:"DEVINX",type:"website"},
  twitter:{card:"summary_large_image",title:"DevinX | Você no controle",description:"Sentinel, Financeiro e Loja: escolha o produto DevinX que faz sentido para sua rotina."}
};

export default function Home(){return <HomeHub/>;}
