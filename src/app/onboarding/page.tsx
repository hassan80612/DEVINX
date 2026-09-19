'use client';

import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {useI18n} from '@/i18n/provider';

type SourceKind='driver'|'delivery'|'salary'|'self_employed'|'other';
type VehicleType='car'|'motorcycle'|'bicycle';
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const dec=(raw:string)=>Number(raw.replace(',','.'))||0;

export default function Onboarding(){
  const{t,locale,setLocale,locales,languageNames}=useI18n();
  const[selected,setSelected]=useState<SourceKind[]>([]);const[otherName,setOtherName]=useState('');const[step,setStep]=useState(1);const[workSources,setWorkSources]=useState<string[]>([]);const[customKind,setCustomKind]=useState<'driver'|'delivery'>('driver');const[customWorkSource,setCustomWorkSource]=useState('');const[saving,setSaving]=useState(false);const[notice,setNotice]=useState('');
  const[vehicleType,setVehicleType]=useState<VehicleType>('car');const[vehicleName,setVehicleName]=useState('');const[energy,setEnergy]=useState('gasoline');const[efficiency,setEfficiency]=useState('');const[unitPrice,setUnitPrice]=useState('');

  const sourceDefs=[{kind:'driver' as const,label:t('onboard.driver'),icon:'🚗'},{kind:'delivery' as const,label:t('onboard.delivery'),icon:'🛵'},{kind:'salary' as const,label:t('onboard.salary'),icon:'💼'},{kind:'self_employed' as const,label:t('onboard.self'),icon:'🧰'},{kind:'other' as const,label:t('onboard.other'),icon:'＋'}];
  const presets:{kind:'driver'|'delivery';name:string}[]=[{kind:'driver',name:'Uber'},{kind:'driver',name:'99'},{kind:'driver',name:'Particular'},{kind:'delivery',name:'iFood'},{kind:'delivery',name:'Rappi'},{kind:'delivery',name:'Mercado Livre'},{kind:'delivery',name:'Shopee'},{kind:'delivery',name:'Particular'}];
  const needsWork=selected.includes('driver')||selected.includes('delivery');const maxStep=needsWork?3:1;const canContinue=useMemo(()=>selected.length>0&&(!selected.includes('other')||otherName.trim().length>1),[selected,otherName]);

  function toggle(kind:SourceKind){setSelected(v=>v.includes(kind)?v.filter(x=>x!==kind):[...v,kind])}
  function keyFor(kind:'driver'|'delivery',name:string){return kind+':'+name}
  function toggleWork(kind:'driver'|'delivery',name:string){const key=keyFor(kind,name);setWorkSources(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key])}
  function addCustom(){const value=customWorkSource.trim();if(!value)return;const key=keyFor(customKind,value);setWorkSources(v=>v.includes(key)?v:[...v,key]);setCustomWorkSource('')}
  function changeVehicleType(type:VehicleType){setVehicleType(type);if(type==='bicycle')setEnergy('human');else if(energy==='human')setEnergy('gasoline')}

  function buildRows(){
    const rows:{kind:SourceKind;name:string}[]=[];
    selected.filter(k=>!['driver','delivery'].includes(k)).forEach(kind=>{const base=sourceDefs.find(s=>s.kind===kind)!;rows.push({kind,name:kind==='other'?otherName.trim():base.label})});
    (['driver','delivery'] as const).forEach(kind=>{if(!selected.includes(kind))return;const names=workSources.filter(v=>v.startsWith(kind+':')).map(v=>v.slice(kind.length+1));(names.length?names:[kind==='driver'?t('onboard.driver'):t('onboard.delivery')]).forEach(name=>rows.push({kind,name}))});
    return rows;
  }

  async function save(includeVehicle:boolean){
    setNotice('');let vehicle:null|{vehicle_type:VehicleType;name:string;energy_type:string;efficiency:number|null;unit_price_minor:number}=null;
    if(needsWork&&includeVehicle){const actual=vehicleType==='bicycle'?'human':energy;if(actual!=='human'&&(dec(efficiency)<=0||minor(unitPrice)<=0)){setNotice(t('onboard.vehicleError'));return}vehicle={vehicle_type:vehicleType,name:vehicleName.trim()||t('onboard.myVehicle'),energy_type:actual,efficiency:actual==='human'?null:dec(efficiency),unit_price_minor:actual==='human'?0:minor(unitPrice)}}
    setSaving(true);const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){setSaving(false);location.href='/entrar';return}const{error}=await s.rpc('complete_initial_setup',{p_sources:buildRows(),p_vehicle:vehicle});if(!error)await s.from('profiles').update({locale}).eq('id',user.id);setSaving(false);if(error){setNotice(t('onboard.saveError'));return}location.href='/painel';
  }
  function next(){if(step===1){if(!canContinue)return;if(!needsWork){save(false);return}setStep(2);return}if(step===2){setStep(3);return}save(true)}

  return <main className="onboarding">
    <header className="onboardingTop"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div><div className="onboardHeaderRight"><div className="stepDots">{Array.from({length:maxStep},(_,i)=><i key={i} className={i+1<=step?'active':''}/>)}</div><select className="languageMini" value={locale} onChange={e=>setLocale(e.target.value as any)}>{locales.map(item=><option key={item} value={item}>{languageNames[item]}</option>)}</select></div></header>
    {step===1&&<section className="onboardingCard"><small>{t('onboard.initial')}</small><h1>{t('onboard.moneyFrom')}</h1><p>{t('onboard.moneyHelp')}</p><div className="sourceGrid">{sourceDefs.map(s=><button type="button" key={s.kind} onClick={()=>toggle(s.kind)} className={selected.includes(s.kind)?'selected':''}><span>{s.icon}</span><b>{s.label}</b><small>{selected.includes(s.kind)?t('onboard.selected'):t('onboard.select')}</small></button>)}</div>{selected.includes('other')&&<label>{t('onboard.profession')}<input value={otherName} onChange={e=>setOtherName(e.target.value)}/></label>}</section>}
    {step===2&&<section className="onboardingCard"><small>{t('onboard.workSources')}</small><h1>{t('onboard.where')}</h1><p>{t('onboard.whereHelp')}</p>{(['driver','delivery'] as const).filter(k=>selected.includes(k)).map(kind=><div className="workSourceGroup" key={kind}><h3>{kind==='driver'?t('onboard.driver'):t('onboard.delivery')}</h3><div className="quickPills">{presets.filter(p=>p.kind===kind).map(p=>{const key=keyFor(p.kind,p.name);return <button type="button" key={key} className={workSources.includes(key)?'selected':''} onClick={()=>toggleWork(p.kind,p.name)}>{workSources.includes(key)?'✓ ':''}{p.name}</button>})}</div></div>)}<div className="sourceInline"><select value={customKind} onChange={e=>setCustomKind(e.target.value as any)}><option value="driver">{t('onboard.driver')}</option><option value="delivery">{t('onboard.delivery')}</option></select><input value={customWorkSource} onChange={e=>setCustomWorkSource(e.target.value)} placeholder={t('onboard.otherSource')}/><button className="secondary" onClick={addCustom}>{t('common.add')}</button></div></section>}
    {step===3&&<section className="onboardingCard"><small>{t('onboard.vehicle')}</small><h1>{t('onboard.vehicleTitle')}</h1><p>{t('onboard.vehicleHelp')}</p><div className="vehicleChoice"><button className={vehicleType==='car'?'selected':''} onClick={()=>changeVehicleType('car')}>🚗 {t('work.car')}</button><button className={vehicleType==='motorcycle'?'selected':''} onClick={()=>changeVehicleType('motorcycle')}>🏍️ {t('work.motorcycle')}</button><button className={vehicleType==='bicycle'?'selected':''} onClick={()=>changeVehicleType('bicycle')}>🚲 {t('work.bicycle')}</button></div><div className="formGrid"><label>{t('work.vehicleName')}<input value={vehicleName} onChange={e=>setVehicleName(e.target.value)}/></label>{vehicleType!=='bicycle'&&<><label>{t('work.energy')}<select value={energy} onChange={e=>setEnergy(e.target.value)}><option value="gasoline">{t('work.gasoline')}</option><option value="ethanol">{t('work.ethanol')}</option><option value="diesel">{t('work.diesel')}</option><option value="hybrid">{t('work.hybrid')}</option><option value="electric">{t('work.electric')}</option></select></label><label>{energy==='electric'?t('work.efficiencyElectric'):t('work.efficiency')}<input value={efficiency} onChange={e=>setEfficiency(e.target.value)} inputMode="decimal"/></label><label>{energy==='electric'?t('work.unitPriceElectric'):t('work.unitPrice')}<input value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} inputMode="decimal"/></label></>}</div><div className="settingsNote"><b>{t('onboard.calcTitle')}</b><span>{t('onboard.calcHelp')}</span></div><button className="textButton" onClick={()=>save(false)} disabled={saving}>{t('onboard.configureLater')}</button></section>}
    {notice&&<div className="authMessage">{notice}</div>}
    <div className="stickyOnboardingActions">{step>1?<button className="secondary" onClick={()=>setStep(step-1)}>{t('common.back')}</button>:<span/>}<button className="primary goldButton" onClick={next} disabled={(step===1&&!canContinue)||saving}>{saving?t('common.saving'):step===maxStep?t('onboard.finish'):t('onboard.continue')}</button></div>
  </main>;
}
