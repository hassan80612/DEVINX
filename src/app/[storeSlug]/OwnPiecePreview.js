"use client";

import { useMemo, useState } from "react";
import { normalizePersonalizationConfig, ownPiecePersonalizationOptions } from "@/lib/store-personalization";

const money=(c)=>(Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
function whatsappDigits(value){let digits=String(value||"").replace(/\D/g,"");if((digits.length===10||digits.length===11)&&!digits.startsWith("55"))digits=`55${digits}`;return digits;}

export default function OwnPiecePreview({contacts=[],storeName="Loja",config}){
  const normalized=useMemo(()=>normalizePersonalizationConfig(config),[config]);
  const MATERIALS=normalized.ownPiece.materials;
  const SERVICES=useMemo(()=>ownPiecePersonalizationOptions(normalized),[normalized]);
  const [open,setOpen]=useState(false);
  const [material,setMaterial]=useState("");
  const [service,setService]=useState("");
  const chosen=useMemo(()=>SERVICES.find(x=>x.id===service)||null,[service]);
  const validContacts=(Array.isArray(contacts)?contacts:[]).filter(contact=>whatsappDigits(contact?.phone));
  if(normalized.ownPiece.enabled===false)return null;
  function send(contact){
    const digits=whatsappDigits(contact?.phone);
    if(!digits||!material||!chosen)return;
    const text=[`Olá! Quero personalizar uma peça própria na ${storeName}.`,`Material: ${material}`,`Personalização: ${chosen.label}`,`Valor de referência da personalização: ${money(chosen.price)}`,"Vou levar/enviar minha própria peça para gravação."].join("\n");
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");
  }
  const ready=Boolean(material&&chosen&&validContacts.length);
  return <section style={{maxWidth:1120,margin:"28px auto 10px",padding:"0 16px"}}>
    <div style={{border:"1px solid rgba(242,203,98,.22)",borderRadius:20,background:"linear-gradient(145deg,rgba(242,203,98,.07),rgba(255,255,255,.018) 45%,rgba(121,216,160,.025))",boxShadow:"0 18px 48px rgba(0,0,0,.2)",overflow:"hidden"}}>
      <button type="button" onClick={()=>setOpen(v=>!v)} style={{width:"100%",border:0,background:"transparent",color:"inherit",padding:"20px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,textAlign:"left",cursor:"pointer"}}>
        <div><small style={{color:"#e8c45f",fontWeight:900,letterSpacing:1.4}}>SERVIÇO DE GRAVAÇÃO</small><h2 style={{margin:"5px 0 4px",fontSize:"clamp(19px,3vw,27px)"}}>Personalize sua própria peça</h2><p style={{margin:0,opacity:.7,fontSize:13}}>Já tem o produto? Traga sua peça e faça somente a personalização.</p></div>
        <span style={{flex:"0 0 40px",height:40,borderRadius:13,border:"1px solid rgba(242,203,98,.28)",display:"grid",placeItems:"center",color:"#e8c45f",fontSize:22}}>{open?"−":"+"}</span>
      </button>
      {open&&<div style={{padding:"0 20px 20px",borderTop:"1px solid rgba(255,255,255,.07)"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12,marginTop:18}}>
          <label style={{display:"grid",gap:7,fontSize:12,fontWeight:850}}>1. Material da sua peça<select value={material} onChange={e=>setMaterial(e.target.value)} style={select}><option value="">Escolha o material</option>{MATERIALS.map(x=><option key={x}>{x}</option>)}</select></label>
          <label style={{display:"grid",gap:7,fontSize:12,fontWeight:850}}>2. Tipo de personalização<select value={service} onChange={e=>setService(e.target.value)} style={select}><option value="">Escolha a personalização</option>{SERVICES.map(x=><option key={x.id} value={x.id}>{x.label} · {money(x.price)}</option>)}</select></label>
        </div>
        <div style={{marginTop:14,padding:"13px 14px",borderRadius:14,border:"1px solid rgba(121,216,160,.16)",background:"rgba(121,216,160,.025)",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:12,opacity:.72}}>Valor de referência da gravação</span><strong style={{color:"#f2cb62",fontSize:17}}>{chosen?money(chosen.price):"—"}</strong></div>
        <small style={{display:"block",marginTop:10,opacity:.62,lineHeight:1.45}}>O valor final pode variar conforme tamanho, formato, estado e complexidade da peça. Quantidades maiores: consultar pelo WhatsApp.</small>
        <div style={{display:"grid",gap:9,marginTop:15}}>{validContacts.map((contact,index)=><button key={`${contact.phone}-${index}`} type="button" disabled={!ready} onClick={()=>send(contact)} style={{width:"100%",border:"1px solid rgba(121,216,160,.35)",borderRadius:13,padding:"12px 15px",background:"linear-gradient(135deg,#1d8d51,#11663b)",color:"white",fontWeight:900,cursor:ready?"pointer":"default",opacity:ready?1:.42}}>Solicitar personalização para {String(contact.name||`Atendimento ${index+1}`).trim()}</button>)}</div>
      </div>}
    </div>
  </section>;
}

const select={width:"100%",height:44,border:"1px solid rgba(242,203,98,.25)",borderRadius:11,background:"#101615",color:"#fff",padding:"0 12px",outline:"none",fontWeight:750};
