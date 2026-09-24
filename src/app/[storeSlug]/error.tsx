"use client";

import {useEffect} from "react";

export default function StorefrontError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  useEffect(()=>{
    console.error("DEVINX_STOREFRONT_ERROR",error?.digest||error?.message||error);
  },[error]);

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#06191b",color:"#f6f7f4"}}>
    <section style={{width:"min(480px,100%)",padding:28,border:"1px solid rgba(218,185,91,.28)",borderRadius:20,background:"#08262a",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,.28)"}}>
      <div style={{color:"#dfbd5d",fontSize:12,fontWeight:900,letterSpacing:1.2}}>DEVINX LOJA</div>
      <h1 style={{margin:"14px 0 8px",fontSize:28}}>Loja temporariamente indisponível</h1>
      <p style={{margin:"0 0 20px",color:"#a8bbb7",lineHeight:1.6}}>Não foi possível carregar os dados da vitrine agora. Tente novamente.</p>
      <button type="button" onClick={reset} style={{border:0,borderRadius:12,padding:"12px 18px",background:"#d1ad47",color:"#111",fontWeight:900,cursor:"pointer"}}>Tentar novamente</button>
    </section>
  </main>;
}
