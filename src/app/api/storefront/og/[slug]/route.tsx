import {ImageResponse} from "next/og";
import {fetchPublicStorefront} from "@/lib/storefront-backend";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const data=await fetchPublicStorefront(slug).catch(()=>null);
  if(!data)return new Response("Not found",{status:404});
  const store=data.store||{};
  if(store.logo_url){
    const logo=await fetch(store.logo_url,{cache:"no-store"}).catch(()=>null);
    if(logo?.ok){
      return new Response(await logo.arrayBuffer(),{
        status:200,
        headers:{
          "Content-Type":logo.headers.get("content-type")||"image/webp",
          "Cache-Control":"public, max-age=60, s-maxage=60, stale-while-revalidate=300"
        }
      });
    }
  }
  const name=String(store.name||"Minha Loja");
  const tagline=String(store.tagline||"Produtos e atendimento direto pela loja");
  const initial=name.trim().slice(0,1).toUpperCase()||"M";
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#07111a 0%,#0d2230 55%,#07111a 100%)",color:"white",fontFamily:"Arial, sans-serif",padding:"72px"}}>
      <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",gap:"58px",border:"2px solid rgba(240,203,112,.45)",borderRadius:"34px",background:"rgba(4,12,18,.72)",padding:"64px"}}>
        <div style={{width:"330px",height:"330px",flex:"0 0 330px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"44px",border:"2px solid rgba(240,203,112,.35)",background:"#0b1720",fontSize:"138px",fontWeight:900,color:"#f0cb70"}}>{initial}</div>
        <div style={{display:"flex",flexDirection:"column",minWidth:0,flex:1}}>
          <div style={{fontSize:"26px",fontWeight:900,letterSpacing:"2px",color:"#f0cb70"}}>DEVINX LOJA</div>
          <div style={{marginTop:"18px",fontSize:"68px",lineHeight:1.04,fontWeight:900}}>{name}</div>
          <div style={{marginTop:"20px",fontSize:"30px",lineHeight:1.35,color:"#b9c8d2"}}>{tagline}</div>
          <div style={{marginTop:"auto",fontSize:"22px",color:"#8fa5b4"}}>devinx.com.br</div>
        </div>
      </div>
    </div>,
    {width:1200,height:630,headers:{"Cache-Control":"public, max-age=60, s-maxage=60, stale-while-revalidate=300"}}
  );
}
