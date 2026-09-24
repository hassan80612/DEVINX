import type {Metadata} from "next";
import {HomeHub} from "@/components/HomeHub";

export const metadata:Metadata={
  title:{absolute:"DevinX | Escolha seu produto"},
  description:"Escolha seu produto DevinX: Financeiro ou Loja. São soluções independentes, com acesso e assinatura próprios.",
  alternates:{canonical:"/"},
  openGraph:{title:"DevinX | Escolha seu produto",description:"Financeiro ou Loja. Produtos independentes, cada um com seu próprio acesso.",url:"https://devinx.com.br",siteName:"DEVINX",type:"website"}
};

export default function Home(){return <HomeHub/>;}
