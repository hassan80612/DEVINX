import {notFound, redirect} from "next/navigation";

const VALID_PLANS=new Set(["essencial","pro","full"]);

export default async function StoreSubscribeBridge({params}:{params:Promise<{plan:string}>}){
  const {plan}=await params;
  const normalized=String(plan||"").trim().toLowerCase();
  if(!VALID_PLANS.has(normalized))notFound();

  redirect(`https://vetorizeai.com.br/minha-loja/assinar/${encodeURIComponent(normalized)}`);
}
