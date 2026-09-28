import '../hub.css';
import '../theme.css';
import type {Metadata} from "next";
import {FinanceLanding} from "@/components/FinanceLanding";

export const metadata:Metadata={
  title:{absolute:"DevinX Financeiro | Controle financeiro e meta diária"},
  description:"Controle contas, gastos, cartões, reservas, metas e renda. Veja quanto precisa ganhar por dia e acompanhe sua rotina financeira.",
  keywords:["controle financeiro","meta diária financeira","controle de gastos","cartões e parcelas","reservas financeiras","renda de autônomo","controle financeiro motorista de aplicativo","DevinX Financeiro"],
  alternates:{canonical:"/financeiro"},
  openGraph:{title:"DevinX Financeiro",description:"Controle financeiro e meta diária em um só lugar.",url:"https://devinx.com.br/financeiro",siteName:"DEVINX",type:"website"},
  twitter:{card:"summary_large_image",title:"DevinX Financeiro | Controle financeiro e meta diária",description:"Controle contas, gastos, cartões, reservas, metas e renda em um só lugar."}
};

export default function FinanceiroPage(){return <FinanceLanding/>;}
