'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Goal={id:string;name:string;period:string;basis:string;target_minor:number};
function minor(raw:string){return Math.round((Number(raw.replace(',','.'))||0)*100)}
function brl(v:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100)}

export function GoalManager(){
  const [items,setItems]=useState<Goal[]>([]);const [open,setOpen]=useState(false);const [name,setName]=useState('Minha meta');const [period,setPeriod]=useState('monthly');const [basis,setBasis]=useState('gross');const [target,setTarget]=useState('');const [notice,setNotice]=useState('');
  async function load(){const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href='/entrar';return}const {data}=await supabase.from('goals').select('id,name,period,basis,target_minor').eq('user_id',user.id).eq('is_active',true).order('created_at',{ascending:false});setItems((data||[]) as Goal[])}
  useEffect(()=>{load()},[]);
  async function submit(e:FormEvent){e.preventDefault();const value=minor(target);if(value<=0){setNotice('Informe o valor da meta.');return}const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)return;const {error}=await supabase.from('goals').insert({user_id:user.id,name:name.trim()||'Minha meta',period,basis,target_minor:value,is_active:true});if(error){setNotice('Não foi possível criar a meta.');return}setOpen(false);setTarget('');setNotice('');await load()}
  return <><button className="primary" onClick={()=>setOpen(!open)}>{open?'Fechar':'+ Criar meta'}</button>{open&&<form className="entryForm" onSubmit={submit}><label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Valor<input value={target} onChange={e=>setTarget(e.target.value)} inputMode="decimal" placeholder="0,00"/></label><label>Período<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></label><label>Tipo<select value={basis} onChange={e=>setBasis(e.target.value)}><option value="gross">Renda bruta</option><option value="operational_net">Líquido operacional</option><option value="savings">Guardar dinheiro</option><option value="payoff">Quitar dívida</option></select></label><button className="primary">Salvar meta</button>{notice&&<div className="authMessage">{notice}</div>}</form>}<div className="goalList">{items.length===0?<section className="empty"><b>Você ainda não criou uma meta</b><p>Crie uma meta diária, semanal ou mensal e acompanhe o progresso pelo painel.</p></section>:items.map(g=><article key={g.id}><div><small>{g.period==='daily'?'DIÁRIA':g.period==='weekly'?'SEMANAL':'MENSAL'}</small><b>{g.name}</b></div><strong>{brl(Number(g.target_minor))}</strong></article>)}</div></>}
