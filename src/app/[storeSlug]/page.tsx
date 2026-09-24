import type {Metadata} from "next";
import {notFound, permanentRedirect} from "next/navigation";
import {fetchPublicStorefront} from "@/lib/storefront-backend";
import StorefrontClient from "./StorefrontClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteProps={params:Promise<{storeSlug:string}>};

export async function generateMetadata({params}:RouteProps):Promise<Metadata>{
  const {storeSlug}=await params;
  try{
    const data=await fetchPublicStorefront(storeSlug);
    if(!data)return{title:"Loja indisponível",robots:{index:false,follow:false}};
    const title=String(data.store?.name||"Minha Loja");
    const description=String(data.store?.tagline||`Produtos de ${title}.`);
    const slug=String(data.canonical_slug||data.store?.slug||storeSlug);
    const image=`/api/storefront/og/${encodeURIComponent(slug)}`;
    return{
      title:{absolute:title},
      description,
      alternates:{canonical:`/${slug}`},
      openGraph:{title,description,url:`https://devinx.com.br/${slug}`,siteName:"DevinX Loja",type:"website",images:[{url:image,alt:`Logo da ${title}`}]},
      twitter:{card:"summary_large_image",title,description,images:[image]},
      robots:{index:true,follow:true}
    };
  }catch{
    return{title:"Loja indisponível",robots:{index:false,follow:false}};
  }
}

export default async function StorefrontPage({params}:RouteProps){
  const {storeSlug}=await params;
  const data=await fetchPublicStorefront(storeSlug).catch(()=>null);
  if(!data)notFound();
  const canonical=String(data.canonical_slug||data.store?.slug||storeSlug);
  if(canonical!==storeSlug)permanentRedirect(`/${encodeURIComponent(canonical)}`);
  return <StorefrontClient initialData={{store:data.store,products:data.products||[],videos:data.videos||[]}}/>;
}
