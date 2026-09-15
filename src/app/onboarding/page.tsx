'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Source = { kind: 'driver'|'delivery'|'salary'|'self_employed'|'other'; label: string; icon: string };

const sources: Source[] = [
  {kind:'driver',label:'Motorista',icon:'🚗'},
  {kind:'delivery',label:'Entregador',icon:'🛵'},
  {kind:'salary',label:'Emprego / Salário',icon:'💼'},
  {kind:'self_employed',label:'Autônomo',icon:'🧰'},
  {kind:'other',label:'Outra profissão',icon:'＋'},
];

export default function Onboarding(){
  const [selected,setSelected]=useState<string[]>([]);
  const [otherName,setOtherName]=useState('');
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const canContinue=useMemo(()=>selected.length>0 && (!selected.includes('other') || otherName.trim().length>1),[selected,otherName]);

  function toggle(kind:string){setSelected(v=>v.includes(kind)?v.filter(x=>x!==kind):[...v,kind])}

  async function save(){
    if(!canContinue)return;
    setSaving(true);setNotice('');
    const supabase=createClient();
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user){setSaving(false);window.location.href='/entrar';return}
    const rows=sources.filter(s=>selected.includes(s.kind)).map(s=>({user_id:user.id,kind:s.kind,name:s.kind==='other'?otherName.trim():s.label}));
    const {error}=await supabase.from('income_sources').insert(rows);
    setSaving(false);
    if(error){setNotice('Não foi possível salvar agora. Tente novamente.');return}
    window.location.href='/painel';
  }

  return <main className="onboarding"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div><section><small>PASSO 1 DE 2</small><h1>De onde vem seu dinheiro?</h1><p>Escolha uma ou mais opções. Você poderá mudar isso quando quiser.</p><div className="sourceGrid">{sources.map(s=><button type="button" key={s.kind} onClick={()=>toggle(s.kind)} className={selected.includes(s.kind)?'selected':''}><span>{s.icon}</span><b>{s.label}</b><small>{selected.includes(s.kind)?'Selecionado':'Selecionar'}</small></button>)}</div>{selected.includes('other')&&<label className="otherProfession">Qual profissão?<input value={otherName} onChange={e=>setOtherName(e.target.value)} placeholder="Ex.: Eletricista, designer, vendedor..."/></label>}{notice&&<div className="authMessage">{notice}</div>}<button onClick={save} disabled={!canContinue||saving} className="primary continue">{saving?'Salvando...':'Continuar'}</button></section></main>}
