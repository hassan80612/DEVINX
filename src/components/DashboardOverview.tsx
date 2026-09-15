'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tx={type:'income'|'expense';amount_minor:number};
type Goal={name:string;target_minor:number;basis:string};
type Bill={amount_minor:number};

function brl(v:number){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100)}

export function DashboardOverview(){
  const [tx,setTx]=useState<Tx[]>([]);const [goals,setGoals]=useState<Goal[]>([]);const [bills,setBills]=useState<Bill[]>([]);const [loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{const supabase=createClient();const {data:{user}}=await supabase.auth.getUser();if(!user){window.location.href='/entrar';return}const now=new Date();const start=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;const endDate=new Date(now.getFullYear(),now.getMonth()+1,0);const end=`${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;const [t,g,b]=await Promise.all([supabase.from('transactions').select('type,amount_minor').eq('user_id',user.id).gte('occurred_on',start).lte('occurred_on',end),supabase.from('goals').select('name,target_minor,basis').eq('user_id',user.id).eq('is_active',true).limit(1),supabase.from('recurring_bills').select('amount_minor').eq('user_id',user.id).eq('is_active',true)]);setTx((t.data||[]) as Tx[]);setGoals((g.data||[]) as Goal[]);setBills((b.data||[]) as Bill[]);setLoading(false)})()},[]);
  const numbers=useMemo(()=>{const income=tx.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount_minor),0);const expense=tx.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount_minor),0);const recurring=bills.reduce((a,b)=>a+Number(b.amount_minor),0);return{income,expense,recurring,balance:income-expense}},[tx,bills]);
  const goal=goals[0];const progress=goal?Math.min(100,Math.round((numbers.income/Number(goal.target_minor))*100)):0;
  if(loading)return <section className="panel"><b>Carregando seus números...</b></section>;
  return <><section className="summaryHero"><small>SALDO DO MÊS</small><strong>{brl(numbers.balance)}</strong><span>entradas menos gastos registrados</span></section><div className="metricGrid"><article><small>Entrou</small><b>{brl(numbers.income)}</b></article><article><small>Gastou</small><b>{brl(numbers.expense)}</b></article><article><small>Recorrentes</small><b>{brl(numbers.recurring)}</b></article><article><small>Meta</small><b>{goal?`${progress}%`:'Não definida'}</b></article></div>{goal&&<section className="panel"><h2>{goal.name}</h2><div className="bar"><i style={{width:`${progress}%`}}/></div><p className="lead">{brl(numbers.income)} de {brl(Number(goal.target_minor))}</p></section>}<section className="panel"><h2>Registro rápido</h2><div className="actionGrid"><a href="/rendas">+ Entrada</a><a href="/gastos">- Gasto</a><a href="/trabalho">+ Trabalho</a></div></section>{tx.length===0&&<section className="empty"><b>Seu painel começa aqui</b><p>Registre sua primeira entrada ou gasto. O Devinx atualiza o resumo automaticamente.</p><a href="/rendas" className="primary">Adicionar primeira renda</a></section>}</>;
}
