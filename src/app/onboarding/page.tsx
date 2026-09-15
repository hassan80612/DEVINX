'use client';

import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';

type SourceKind='driver'|'delivery'|'salary'|'self_employed'|'other';
type Source={kind:SourceKind;label:string;icon:string};
type VehicleType='car'|'motorcycle'|'bicycle';
const sources:Source[]=[{kind:'driver',label:'Motorista',icon:'🚗'},{kind:'delivery',label:'Entregador',icon:'🛵'},{kind:'salary',label:'Emprego / Salário',icon:'💼'},{kind:'self_employed',label:'Autônomo',icon:'🧰'},{kind:'other',label:'Outra profissão',icon:'＋'}];
const presets:{kind:'driver'|'delivery';name:string}[]=[{kind:'driver',name:'Uber'},{kind:'driver',name:'99'},{kind:'driver',name:'Particular'},{kind:'delivery',name:'iFood'},{kind:'delivery',name:'Rappi'},{kind:'delivery',name:'Mercado Livre'},{kind:'delivery',name:'Shopee'},{kind:'delivery',name:'Particular'}];
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const dec=(raw:string)=>Number(raw.replace(',','.'))||0;

export default function Onboarding(){
  const[selected,setSelected]=useState<SourceKind[]>([]);const[otherName,setOtherName]=useState('');const[step,setStep]=useState(1);const[workSources,setWorkSources]=useState<string[]>([]);const[customKind,setCustomKind]=useState<'driver'|'delivery'>('driver');const[customWorkSource,setCustomWorkSource]=useState('');const[saving,setSaving]=useState(false);const[notice,setNotice]=useState('');
  const[vehicleType,setVehicleType]=useState<VehicleType>('car');const[vehicleName,setVehicleName]=useState('Meu carro');const[energy,setEnergy]=useState('gasoline');const[efficiency,setEfficiency]=useState('10');const[unitPrice,setUnitPrice]=useState('6');
  const needsWork=selected.includes('driver')||selected.includes('delivery');
  const maxStep=needsWork?3:1;
  const canContinue=useMemo(()=>selected.length>0&&(!selected.includes('other')||otherName.trim().length>1),[selected,otherName]);
  const visiblePresets=presets.filter(p=>selected.includes(p.kind));
  const keyFor=(kind:'driver'|'delivery',name:string)=>`${kind}:${name}`;
  function toggle(kind:SourceKind){setSelected(v=>v.includes(kind)?v.filter(x=>x!==kind):[...v,kind])}
  function toggleWork(kind:'driver'|'delivery',name:string){const key=keyFor(kind,name);setWorkSources(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key])}
  function addCustom(){const value=customWorkSource.trim();if(!value)return;const key=keyFor(customKind,value);setWorkSources(v=>v.includes(key)?v:[...v,key]);setCustomWorkSource('')}
  function changeVehicleType(type:VehicleType){setVehicleType(type);setVehicleName(type==='motorcycle'?'Minha moto':type==='bicycle'?'Minha bicicleta':'Meu carro');if(type==='bicycle')setEnergy('human');else if(energy==='human')setEnergy('gasoline')}

  function buildRows(){
    const rows:{kind:SourceKind;name:string}[]=[];
    selected.filter(k=>!['driver','delivery'].includes(k)).forEach(kind=>{const base=sources.find(s=>s.kind===kind)!;rows.push({kind,name:kind==='other'?otherName.trim():base.label})});
    (['driver','delivery'] as const).forEach(kind=>{if(!selected.includes(kind))return;const names=workSources.filter(v=>v.startsWith(kind+':')).map(v=>v.slice(kind.length+1));(names.length?names:[kind==='driver'?'Motorista':'Entregador']).forEach(name=>rows.push({kind,name}))});
    return rows;
  }

  async function save(){setSaving(true);setNotice('');const supabase=createClient();const{data:{user}}=await supabase.auth.getUser();if(!user){setSaving(false);location.href='/entrar';return}const rows=buildRows();const vehicle=needsWork?{vehicle_type:vehicleType,name:vehicleName.trim(),energy_type:vehicleType==='bicycle'?'human':energy,efficiency:vehicleType==='bicycle'?null:dec(efficiency),unit_price_minor:vehicleType==='bicycle'?0:minor(unitPrice)}:null;const{error}=await supabase.rpc('complete_initial_setup',{p_sources:rows,p_vehicle:vehicle});setSaving(false);if(error){setNotice('Não foi possível concluir a configuração. Revise os dados e tente novamente.');return}location.href='/painel'}
  function next(){if(step===1){if(!canContinue)return;if(!needsWork){save();return}setStep(2);return}if(step===2){setStep(3);return}save()}
  function back(){if(step>1)setStep(step-1)}

  return <main className="onboarding premiumOnboarding"><header className="onboardingTop"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div><div className="stepDots">{Array.from({length:maxStep},(_,i)=><i key={i} className={i+1<=step?'active':''}/>)}</div></header>
    {step===1&&<section><small>CONFIGURAÇÃO INICIAL</small><h1>De onde vem seu dinheiro?</h1><p>Escolha tudo que se aplica. Um toque seleciona; você pode marcar várias fontes.</p><div className="sourceGrid">{sources.map(s=><button type="button" key={s.kind} onClick={()=>toggle(s.kind)} className={selected.includes(s.kind)?'selected':''}><span>{s.icon}</span><b>{s.label}</b><small>{selected.includes(s.kind)?'✓ Selecionado':'Selecionar'}</small></button>)}</div>{selected.includes('other')&&<label className="otherProfession">Qual profissão?<input value={otherName} onChange={e=>setOtherName(e.target.value)} placeholder="Ex.: Eletricista, designer, vendedor..."/></label>}</section>}

    {step===2&&<section><small>FONTES DE TRABALHO</small><h1>Onde você trabalha?</h1><p>Marque as plataformas que usa. Isso serve para comparar seu próprio resultado depois.</p><div className="workGroups">{selected.includes('driver')&&<div><h3>Motorista</h3><div className="quickPills">{visiblePresets.filter(p=>p.kind==='driver').map(p=>{const key=keyFor(p.kind,p.name);return <button type="button" key={key} onClick={()=>toggleWork(p.kind,p.name)} className={workSources.includes(key)?'selected':''}>{workSources.includes(key)?'✓ ':''}{p.name}</button>})}</div></div>}{selected.includes('delivery')&&<div><h3>Entregador</h3><div className="quickPills">{visiblePresets.filter(p=>p.kind==='delivery').map(p=>{const key=keyFor(p.kind,p.name);return <button type="button" key={key} onClick={()=>toggleWork(p.kind,p.name)} className={workSources.includes(key)?'selected':''}>{workSources.includes(key)?'✓ ':''}{p.name}</button>})}</div></div>}</div><div className="inlineAdd sourceAdd"><select value={customKind} onChange={e=>setCustomKind(e.target.value as 'driver'|'delivery')}><option value="driver">Motorista</option><option value="delivery">Entregador</option></select><input value={customWorkSource} onChange={e=>setCustomWorkSource(e.target.value)} placeholder="Outra plataforma ou fonte"/><button type="button" className="secondary" onClick={addCustom}>Adicionar</button></div></section>}

    {step===3&&<section><small>VEÍCULO E CONSUMO</small><h1>Configure uma vez. Depois o Devinx calcula.</h1><p>Esses dados alimentam combustível, energia, custo por hora e custo por km automaticamente.</p><div className="vehicleChoice">{(['car','motorcycle','bicycle'] as VehicleType[]).map(type=><button type="button" className={vehicleType===type?'selected':''} onClick={()=>changeVehicleType(type)} key={type}>{type==='car'?'🚗 Carro':type==='motorcycle'?'🏍️ Moto':'🚲 Bicicleta'}</button>)}</div><div className="entryForm onboardingVehicleForm"><label>Nome do veículo<input value={vehicleName} onChange={e=>setVehicleName(e.target.value)}/></label>{vehicleType!=='bicycle'&&<><label>Combustível / energia<select value={energy} onChange={e=>setEnergy(e.target.value)}><option value="gasoline">Gasolina</option><option value="ethanol">Etanol</option><option value="diesel">Diesel</option><option value="hybrid">Híbrido</option><option value="electric">Elétrico</option></select></label><label>{energy==='electric'?'Km por kWh':'Km por litro'}<input value={efficiency} onChange={e=>setEfficiency(e.target.value)} inputMode="decimal" placeholder={energy==='electric'?'Ex.: 6,5':'Ex.: 11,5'}/></label><label>{energy==='electric'?'Preço do kWh':'Preço por litro'}<input value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} inputMode="decimal" placeholder="Ex.: 6,19"/></label></>}</div><div className="smartSetupNote"><b>Você não será obrigado a informar KM todo dia.</b><span>Se informar KM, calculamos o gasto. Se informar só quanto gastou em combustível/energia, estimamos os KM usando o consumo acima.</span></div></section>}

    {notice&&<div className="authMessage">{notice}</div>}
    <div className="stickyOnboardingActions">{step>1?<button className="secondary" onClick={back}>Voltar</button>:<span/>}<button className="primary" onClick={next} disabled={(step===1&&!canContinue)||saving}>{saving?'Salvando...':step===maxStep?'Concluir':'Continuar'}</button></div>
  </main>}
