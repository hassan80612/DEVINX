import type {Metadata} from "next";
import {HomeHub} from "@/components/HomeHub";

export const metadata:Metadata={
  title:{absolute:"DevinX | Financeiro e Loja"},
  description:"Escolha entre DevinX Financeiro para organizar sua vida financeira e DevinX Loja para organizar produtos, estoque e vendas.",
  alternates:{canonical:"/"},
  openGraph:{title:"DevinX",description:"Financeiro e Loja, cada um no seu lugar.",url:"https://devinx.com.br",siteName:"DEVINX",type:"website"}
};

export default function Home(){return <HomeHub/>;}
