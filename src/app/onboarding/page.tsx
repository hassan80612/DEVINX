'use client';

import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type SourceKind='driver'|'delivery'|'salary'|'self_employed'|'other';
type Source={kind:SourceKind;label:string;icon:string};
const sources:Source[]=[{kind:'driver',label:'Motorista',icon:'🚗'},{kind:'delivery',label:'Entregador',icon:'🛵'},{kind:'salary',label:'Emprego / Salário',icon:'💼'},{kind:'self_employed',label:'Autônomo',icon:'🧰'},{kind:'other',label:'Outra profissão',icon:'＋'}];
const driverPresets=['Uber','99','Particular'];
const deliveryPresets=['iFood','Rappi','Mercado Livre','Shopee','Particular'];

export default function Onboarding(){
  const[selected,setSelected]=useState<SourceKind[]>([]);const[otherName,setOtherName]=useState('');const[step,setStep]=useState(1);const[workSources,setWorkSources]=useState<string[]>([]);const[customWorkSource,setCustomWorkSource]=useState('');const[saving,setSaving]=useState(false);const[notice,setNotice]=useState('');
  const needsWorkStep=selected.includes('driver')||selected.includes('delivery');
  const canContinue=useMemo(()=>selected.length>0&&(!selected.includes('other')||otherName.trim().length>1),[selected,otherName]);
  const presets=useMemo(()=>Array.from(new Set([...(selected.includes('driver')?driverPresets:[]),...(selected.includes('delivery')?deliveryPresets:[])])),[selected]);
  function toggle(kind:SourceKind){setSelected(v=>v.includes(kind)?v.filter(x=>x!==kind):[...v,kind])}
  function toggleWork(name:string){setWorkSources(v=>v.includes(name)?v.filter(x=>x!==name):[...v,name])}
  function addCustom(){const value=customWorkSource.trim();if(!value)return;setWorkSources(v=>v.includes(value)?v:[...v,value]);setCustomWorkSource('')}
  async function save(){setSaving(true);setNotice('');const supabase=createClient();const{data:{user},error:userError}=await supabase.auth.getUser();if(userError||!user){setSaving(false);location.href='/entrar';return}
    const rows:{user_id:string;kind:SourceKind;name:string}[]=[];
    selected.filter(k=>!['driver','delivery'].includes(k)).forEach(kind=>{const base=sources.find(s=>s.kind===kind)!;rows.push({user_id:user.id,kind,name:kind==='other'?otherName.trim():base.label})});
    if(selected.includes('driver')){const names=workSources.filter(n=>driverPresets.includes(n)||!deliveryPresets.includes(n));(names.length?names:['Motorista']).forEach(name=>rows.push({user_id:user.id,kind:'driver',name}))}
    if(selected.includes('delivery')){const names=workSources.filter(n=>deliveryPresets.includes(n)||!driverPresets.includes(n));(names.length?names:['Entregador']).forEach(name=>rows.push({user_id:user.id,kind:'delivery',name}))}
    const{error}=await supabase.from('income_sources').upsert(rows,{onConflict:'user_id,kind,name',ignoreDuplicates:true});if(error){setSaving(false);setNotice('Não foi possível salvar agora. Tente novamente.');return}
    const{error:profileError}=await supabase.from('profiles').update({onboarded_at:new Date().toISOString()}).eq('id',user.id);setSaving(false);if(profileError){setNotice('Sua configuração foi salva, mas não foi possível finalizar. Tente novamente.');return}location.href='/painel'}
  function next(){if(!canContinue)return;if(needsWorkStep)setStep(2);else save()}
  return <main className="onboarding"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div>{step===1?<section><small>CONFIGURAÇÃO INICIAL</small><h1>De onde vem seu dinheiro?</h1><p>Escolha uma ou mais opções. Você poderá adicionar outras fontes depois.</p><div className="sourceGrid">{sources.map(s=><button type="button" key={s.kind} onClick={()=>toggle(s.kind)} className={selected.includes(s.kind)?'selected':''}><span>{s.icon}</span><b>{s.label}</b><small>{selected.includes(s.kind)?'Selecionado':'Selecionar'}</small></button>)}</div>{selected.includes('other')&&<label className="otherProfession">Qual profissão?<input value={otherName} onChange={e=>setOtherName(e.target.value)} placeholder="Ex.: Eletricista, designer, vendedor..."/></label>}<button onClick={next} disabled={!canContinue||saving} className="primary continue">{saving?'Salvando...':needsWorkStep?'Continuar':'Finalizar'}</button></section>:<section><small>FONTES DE TRABALHO</small><h1>Onde você costuma trabalhar?</h1><p>Isso permite comparar seus próprios resultados por fonte. As opções são apenas atalhos; o Devinx não depende dessas empresas.</p><div className="sourceGrid">{presets.map(name=><button type="button" key={name} onClick={()=>toggleWork(name)} className={workSources.includes(name)?'selected':''}><span>◎</span><b>{name}</b><small>{workSources.includes(name)?'Selecionado':'Selecionar'}</small></button>)}</div><div className="inlineAdd"><input value={customWorkSource} onChange={e=>setCustomWorkSource(e.target.value)} placeholder="Outra plataforma ou fonte"/><button type="button" className="secondary" onClick={addCustom}>Adicionar</button></div>{workSources.filter(n=>!presets.includes(n)).length>0&&<div className="tagRow">{workSources.filter(n=>!presets.includes(n)).map(n=><button key={n} onClick={()=>toggleWork(n)}>{n} ×</button>)}</div>}{notice&&<div className="authMessage">{notice}</div>}<div className="onboardingActions"><button className="secondary" onClick={()=>setStep(1)}>Voltar</button><button className="primary" onClick={save} disabled={saving}>{saving?'Salvando...':'Finalizar configuração'}</button></div></section>}</main>}
