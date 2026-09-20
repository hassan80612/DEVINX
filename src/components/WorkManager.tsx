'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {localDateISO} from '@/lib/date';
import {useI18n} from '@/i18n/provider';

type Vehicle={id:string;name:string;vehicle_type:'car'|'motorcycle'|'bicycle';energy_type:string;efficiency:number|null;unit_price_minor:number|null;default_fuel_percent:number|null;is_default:boolean};
type Source={id:string;name:string;kind:string};
type Session={id:string;vehicle_id:string|null;income_source_id:string|null;worked_on:string;gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;distance_km:number;minutes_worked:number};
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const dec=(raw:string)=>Number(raw.replace(',','.'))||0;
const date30=()=>{const d=new Date();d.setDate(d.getDate()-29);return localDateISO(d)};

function energyCost(vehicle:Vehicle,gross:number,km:number,pct:number){
  if(vehicle.energy_type==='human')return 0;
  if(km>0&&Number(vehicle.efficiency)>0&&Number(vehicle.unit_price_minor)>0)return Math.round((km/Number(vehicle.efficiency))*Number(vehicle.unit_price_minor));
  const effectivePct=pct>0?pct:Number(vehicle.default_fuel_percent||0);
  if(effectivePct>0)return Math.round(gross*(effectivePct/100));
  return 0;
}

export function WorkManager(){
  const{t,currency,date}=useI18n();
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[sources,setSources]=useState<Source[]>([]);
  const[sessions,setSessions]=useState<Session[]>([]);
  const[selectedVehicleId,setSelectedVehicleId]=useState('');
  const[vehicleMode,setVehicleMode]=useState<'new'|'edit'|null>(null);
  const[vName,setVName]=useState('');
  const[vType,setVType]=useState<'car'|'motorcycle'|'bicycle'>('car');
  const[vEnergy,setVEnergy]=useState('gasoline');
  const[vEfficiency,setVEfficiency]=useState('');
  const[vPrice,setVPrice]=useState('');
  const[vDefaultPct,setVDefaultPct]=useState('');
  const[sourceId,setSourceId]=useState('');
  const[newSource,setNewSource]=useState('');
  const[gross,setGross]=useState('');
  const[hours,setHours]=useState('');
  const[km,setKm]=useState('');
  const[fuelPercent,setFuelPercent]=useState('');
  const[extra,setExtra]=useState('0');
  const[notice,setNotice]=useState('');
  const[saving,setSaving]=useState(false);
  const[editing,setEditing]=useState<Session|null>(null);
  const[eVehicle,setEVehicle]=useState('');const[eSource,setESource]=useState('');const[eDate,setEDate]=useState('');const[eGross,setEGross]=useState('');const[eHours,setEHours]=useState('');const[eKm,setEKm]=useState('');const[ePct,setEPct]=useState('');const[eExtra,setEExtra]=useState('');
  const[journeyExpanded,setJourneyExpanded]=useState(()=>{
    if(typeof window==='undefined')return true;
    try{const saved=localStorage.getItem('devinx_work_journey_expanded');return saved===null?true:saved==='1'}catch{return true}
  });

  const vehicle=vehicles.find(v=>v.id===selectedVehicleId)||vehicles[0]||null;
  const selectedSource=sources.find(s=>s.id===sourceId)||null;
  const usesVehicle=selectedSource?.kind==='driver'||selectedSource?.kind==='delivery';
  const editSource=sources.find(s=>s.id===eSource)||null;
  const editUsesVehicle=editSource?.kind==='driver'||editSource?.kind==='delivery';

  async function load(){
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const[v,src,ss]=await Promise.all([
      s.from('vehicles').select('id,name,vehicle_type,energy_type,efficiency,unit_price_minor,default_fuel_percent,is_default').eq('user_id',user.id).order('is_default',{ascending:false}).order('created_at'),
      s.from('income_sources').select('id,name,kind').eq('user_id',user.id).eq('is_active',true).order('created_at'),
      s.from('work_sessions').select('id,vehicle_id,income_source_id,worked_on,gross_income_minor,energy_cost_minor,extra_work_cost_minor,distance_km,minutes_worked').eq('user_id',user.id).gte('worked_on',date30()).order('worked_on',{ascending:false}).order('created_at',{ascending:false}).limit(60)
    ]);
    const vv=(v.data||[]) as Vehicle[];const sourceRows=(src.data||[]) as Source[];setVehicles(vv);setSources(sourceRows);setSessions((ss.data||[]) as Session[]);
    if(!selectedVehicleId&&vv.length)setSelectedVehicleId(vv.find(x=>x.is_default)?.id||vv[0].id);
    if(!sourceId&&sourceRows.length)setSourceId(sourceRows[0].id);
    const activeSource=sourceRows.find(x=>x.id===sourceId)||sourceRows[0]||null;
    if(vv.length===0&&(activeSource?.kind==='driver'||activeSource?.kind==='delivery'))setVehicleMode('new');
  }
  useEffect(()=>{load()},[]);
  function toggleJourney(){setJourneyExpanded(current=>{const next=!current;try{localStorage.setItem('devinx_work_journey_expanded',next?'1':'0')}catch{}return next})}

  const stats=useMemo(()=>{
    const grossTotal=sessions.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const cost=sessions.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0);
    const h=sessions.reduce((a,b)=>a+Number(b.minutes_worked),0)/60;
    const distance=sessions.reduce((a,b)=>a+Number(b.distance_km),0);
    const net=grossTotal-cost;
    return{gross:grossTotal,cost,h,distance,net,netHour:h?net/h:0,netKm:distance?net/distance:0,energy:sessions.reduce((a,b)=>a+Number(b.energy_cost_minor),0)};
  },[sessions]);

  function openVehicle(mode:'new'|'edit'){
    setVehicleMode(mode);setNotice('');
    if(mode==='edit'&&vehicle){setVName(vehicle.name);setVType(vehicle.vehicle_type);setVEnergy(vehicle.energy_type);setVEfficiency(vehicle.efficiency==null?'':String(vehicle.efficiency).replace('.',','));setVPrice(vehicle.unit_price_minor==null?'':String(Number(vehicle.unit_price_minor)/100).replace('.',','));setVDefaultPct(vehicle.default_fuel_percent==null?'':String(Number(vehicle.default_fuel_percent)).replace('.',','))}
    else{setVName('');setVType('car');setVEnergy('gasoline');setVEfficiency('');setVPrice('');setVDefaultPct('')}
  }
  function changeVType(type:'car'|'motorcycle'|'bicycle'){setVType(type);if(type==='bicycle')setVEnergy('human');else if(vEnergy==='human')setVEnergy('gasoline')}

  async function saveVehicle(e:FormEvent){
    e.preventDefault();const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const actualEnergy=vType==='bicycle'?'human':vEnergy;const efficiency=actualEnergy==='human'?null:dec(vEfficiency);const price=actualEnergy==='human'?0:minor(vPrice);const defaultPct=actualEnergy==='human'?null:(vDefaultPct?dec(vDefaultPct):null);
    if(actualEnergy!=='human'&&(Number(efficiency)<=0||price<=0)){setNotice(t('work.needVehicleNumbers'));return}if(defaultPct!=null&&(defaultPct<=0||defaultPct>100)){setNotice(t('work.defaultFuelPercentInvalid'));return}
    let error:any=null;
    if(vehicleMode==='edit'&&vehicle)({error}=await s.from('vehicles').update({name:vName.trim()||vehicle.name,vehicle_type:vType,energy_type:actualEnergy,efficiency,unit_price_minor:price,default_fuel_percent:defaultPct}).eq('id',vehicle.id).eq('user_id',user.id));
    else{
      const{data,error:e2}=await s.from('vehicles').insert({user_id:user.id,name:vName.trim()||t('work.vehicleName'),vehicle_type:vType,energy_type:actualEnergy,efficiency,unit_price_minor:price,default_fuel_percent:defaultPct,is_default:vehicles.length===0}).select('id').single();error=e2;if(data?.id)setSelectedVehicleId(data.id);
    }
    if(error){setNotice(t('work.vehicleSaveError'));return}
    setVehicleMode(null);setNotice(t('work.vehicleSaved'));await load();
  }

  async function selectVehicle(id:string){
    setSelectedVehicleId(id);const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    await s.rpc('set_default_vehicle',{p_vehicle_id:id});
  }

  async function addSource(){
    const value=newSource.trim();if(!value)return;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{data,error}=await s.from('income_sources').insert({user_id:user.id,kind:'other',name:value}).select('id,name,kind').single();
    if(error){setNotice(t('work.sourceSaveError'));return}
    setNewSource('');if(data){setSourceId(data.id);setSources(current=>[...current,data as Source])}
  }

  async function saveSession(e:FormEvent){
    e.preventDefault();
    if(!sourceId){setNotice(t('work.needSource'));return}
    if(usesVehicle&&!vehicle){setNotice(t('work.configureVehicle'));return}
    const worked=dec(hours);const distance=usesVehicle?dec(km):0;const pct=usesVehicle?dec(fuelPercent):0;const grossMinor=minor(gross);
    if(worked<=0){setNotice(t('work.needHours'));return}
    if(usesVehicle&&vehicle&&vehicle.energy_type!=='human'&&distance<=0&&(pct<=0||pct>100)&&!Number(vehicle.default_fuel_percent)){setNotice(t('work.needCalc'));return}
    setSaving(true);const cost=usesVehicle&&vehicle?energyCost(vehicle,grossMinor,distance,pct):0;const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){setSaving(false);return}
    const{error}=await s.from('work_sessions').insert({user_id:user.id,vehicle_id:usesVehicle?vehicle?.id||null:null,income_source_id:sourceId||null,worked_on:localDateISO(),gross_income_minor:grossMinor,energy_cost_minor:cost,extra_work_cost_minor:minor(extra),distance_km:Number(distance.toFixed(2)),minutes_worked:Math.round(worked*60)});
    setSaving(false);if(error){setNotice(t('work.sessionSaveError'));return}
    const net=grossMinor-cost-minor(extra);setGross('');setHours('');setKm('');setFuelPercent('');setExtra('0');setNotice(t('work.saved')+' '+t('work.net')+': '+currency(net));window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  function startEdit(s:Session){
    const v=vehicles.find(x=>x.id===s.vehicle_id)||vehicle;setEditing(s);setEVehicle(s.vehicle_id||v?.id||'');setESource(s.income_source_id||'');setEDate(s.worked_on);setEGross(String(Number(s.gross_income_minor)/100).replace('.',','));setEHours(String(Number(s.minutes_worked)/60).replace('.',','));setEKm(Number(s.distance_km)>0?String(Number(s.distance_km)).replace('.',','):'');const pct=Number(s.distance_km)<=0&&Number(s.gross_income_minor)>0?Number(s.energy_cost_minor)/Number(s.gross_income_minor)*100:0;setEPct(pct?String(Number(pct.toFixed(2))).replace('.',','):'');setEExtra(String(Number(s.extra_work_cost_minor)/100).replace('.',','));
  }
  async function updateSession(e:FormEvent){
    e.preventDefault();if(!editing)return;if(!eSource){setNotice(t('work.needSource'));return}
    const v=editUsesVehicle?vehicles.find(x=>x.id===eVehicle):null;
    if(editUsesVehicle&&!v){setNotice(t('work.configureVehicle'));return}
    const worked=dec(eHours),distance=editUsesVehicle?dec(eKm):0,pct=editUsesVehicle?dec(ePct):0,grossMinor=minor(eGross);
    if(worked<=0){setNotice(t('work.needHours'));return}
    if(editUsesVehicle&&v&&v.energy_type!=='human'&&distance<=0&&(pct<=0||pct>100)&&!Number(v.default_fuel_percent)){setNotice(t('work.needCalc'));return}
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('work_sessions').update({vehicle_id:editUsesVehicle?v?.id||null:null,income_source_id:eSource||null,worked_on:eDate,gross_income_minor:grossMinor,energy_cost_minor:editUsesVehicle&&v?energyCost(v,grossMinor,distance,pct):0,extra_work_cost_minor:minor(eExtra),distance_km:Number(distance.toFixed(2)),minutes_worked:Math.round(worked*60)}).eq('id',editing.id).eq('user_id',user.id);
    if(error){setNotice(t('common.errorUpdate'));return}setEditing(null);setNotice(t('work.sessionUpdated'));window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }
  async function deleteSession(ses:Session){if(!confirm(t('work.deleteConfirm')))return;const s=createClient();const{error}=await s.from('work_sessions').delete().eq('id',ses.id);if(error){setNotice(t('common.errorDelete'));return}window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load()}

  return <div className="workPage">
    <p className="sectionLead">{usesVehicle?t('work.lead'):t('work.generalLead')}</p>
    {usesVehicle&&vehicle&&<section className="vehicleHero"><div className="vehicleHeroInfo"><small>{t('work.vehicleInUse')}</small>{vehicles.length>1?<select value={vehicle.id} onChange={e=>selectVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>:<h2>{vehicle.name}</h2>}<div className="vehicleSpecs"><span><b>{t('work.vehicleName')}:</b> {vehicle.name}</span><span><b>{t('work.vehicleType')}:</b> {vehicle.vehicle_type==='car'?t('work.car'):vehicle.vehicle_type==='motorcycle'?t('work.motorcycle'):t('work.bicycle')}</span>{vehicle.energy_type!=='human'&&<><span><b>{t('work.energy')}:</b> {t('work.'+vehicle.energy_type)}</span><span><b>{vehicle.energy_type==='electric'?t('work.efficiencyElectric'):t('work.efficiency')}:</b> {vehicle.efficiency??'—'} {vehicle.energy_type==='electric'?'km/kWh':'km/L'}</span><span><b>{vehicle.energy_type==='electric'?t('work.unitPriceElectric'):t('work.unitPrice')}:</b> {vehicle.unit_price_minor!=null?currency(Number(vehicle.unit_price_minor)):'—'} / {vehicle.energy_type==='electric'?'kWh':'L'}</span>{vehicle.default_fuel_percent!=null&&<span><b>{t('work.defaultFuelPercent')}:</b> {Number(vehicle.default_fuel_percent)}%</span>}</>}</div></div><div className="vehicleHeroActions"><button className="secondary" onClick={()=>openVehicle('edit')}>{t('work.editVehicle')}</button><button className="goldOutline" onClick={()=>openVehicle('new')}>{t('work.addVehicle')}</button></div></section>}

    {vehicleMode&&<form className="panel formGrid premiumForm" onSubmit={saveVehicle}><div className="sectionTitleRow"><h2>{vehicleMode==='new'?t('work.addVehicle'):t('work.editVehicle')}</h2><button type="button" className="textButton" onClick={()=>setVehicleMode(null)}>{t('common.close')}</button></div><label>{t('work.vehicleName')}<input value={vName} onChange={e=>setVName(e.target.value)} required/></label><label>{t('work.vehicleType')}<select value={vType} onChange={e=>changeVType(e.target.value as any)}><option value="car">{t('work.car')}</option><option value="motorcycle">{t('work.motorcycle')}</option><option value="bicycle">{t('work.bicycle')}</option></select></label>{vType!=='bicycle'&&<><label>{t('work.energy')}<select value={vEnergy} onChange={e=>setVEnergy(e.target.value)}><option value="gasoline">{t('work.gasoline')}</option><option value="ethanol">{t('work.ethanol')}</option><option value="diesel">{t('work.diesel')}</option><option value="hybrid">{t('work.hybrid')}</option><option value="electric">{t('work.electric')}</option></select></label><label>{vEnergy==='electric'?t('work.efficiencyElectric'):t('work.efficiency')}<input value={vEfficiency} onChange={e=>setVEfficiency(e.target.value)} inputMode="decimal"/></label><label>{vEnergy==='electric'?t('work.unitPriceElectric'):t('work.unitPrice')}<input value={vPrice} onChange={e=>setVPrice(e.target.value)} inputMode="decimal"/></label><label>{t('work.defaultFuelPercent')} <small>({t('common.optional')})</small><input value={vDefaultPct} onChange={e=>setVDefaultPct(e.target.value)} inputMode="decimal" placeholder="15"/></label></>}<button className="primary">{t('common.save')}</button></form>}

    <div className="metricGrid workMetrics"><article><small>{t('work.netHour')}</small><b>{stats.h?currency(Math.round(stats.netHour)):'—'}</b></article><article><small>{t('work.netKm')}</small><b>{stats.distance?currency(Math.round(stats.netKm)):'—'}</b></article><article><small>{t('work.energyCost')}</small><b>{currency(stats.energy)}</b></article><article><small>{t('work.net')}</small><b>{currency(stats.net)}</b></article></div>

    <section className={'panel collapsiblePanel '+(!journeyExpanded?'isCollapsed':'')}><div className="sectionTitleRow collapsibleTitleRow"><div><small>{t('work.record').toUpperCase()}</small><h2>{t('work.record')}</h2></div><button type="button" className="collapseToggle" onClick={toggleJourney} aria-expanded={journeyExpanded}>{journeyExpanded?t('common.collapseSection'):t('common.expandSection')} <span>{journeyExpanded?'⌃':'⌄'}</span></button></div>{journeyExpanded&&<div className="collapsibleBody"><form className="entryForm journeyForm" onSubmit={saveSession}><label>{t('work.source')}<select value={sourceId} onChange={e=>{const next=e.target.value;setSourceId(next);setKm('');setFuelPercent('');const src=sources.find(s=>s.id===next);if((src?.kind==='driver'||src?.kind==='delivery')&&vehicles.length===0)setVehicleMode('new')}}><option value="">—</option>{sources.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>{t('work.gross')}<input value={gross} onChange={e=>setGross(e.target.value)} inputMode="decimal" required/></label><label>{t('work.hours')}<input value={hours} onChange={e=>setHours(e.target.value)} inputMode="decimal" required/></label>{usesVehicle&&vehicle&&vehicle.energy_type!=='human'&&<><label>{t('work.km')} <small>({t('common.optional')})</small><input value={km} onChange={e=>setKm(e.target.value)} inputMode="decimal"/></label>{vehicle.default_fuel_percent==null?<label>{t('work.percent')} <small>({t('common.optional')})</small><input value={fuelPercent} onChange={e=>setFuelPercent(e.target.value)} inputMode="decimal"/></label>:<div className="settingsNote"><b>{t('work.defaultFuelPercent')}: {Number(vehicle.default_fuel_percent)}%</b><span>{t('work.defaultFuelPercentHelp')}</span></div>}</>}{usesVehicle&&!vehicle&&<div className="settingsNote"><b>{t('work.configureVehicle')}</b><span>{t('work.driverSourceHelp')}</span></div>}<label>{t('work.extra')}<input value={extra} onChange={e=>setExtra(e.target.value)} inputMode="decimal"/></label>{usesVehicle&&<small className="formHint">{t('work.autoPriority')}</small>}<button className="primary saveJourneyButton" disabled={saving} aria-busy={saving}>{saving?<><span className="buttonSpinner"/>{t('common.saving')}</>:t('work.save')}</button></form><div className="sourceInline"><input value={newSource} onChange={e=>setNewSource(e.target.value)} placeholder={t('work.sourceName')} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addSource()}}}/><button className="secondary" type="button" onClick={addSource}>{t('work.addSource')}</button></div></div>}</section>

    {notice&&<div className="authMessage">{notice}</div>}
    <section className="panel recentWorkPanel"><div className="sectionTitleRow"><div><small>{t('common.history').toUpperCase()}</small><h2>{t('work.history')}</h2></div></div>{sessions.length===0?<div className="empty"><b>{t('work.noHistory')}</b></div>:<div className="workSessionList">{sessions.slice(0,30).map(s=>{const src=sources.find(x=>x.id===s.income_source_id)?.name||t('move.workIncome');const v=vehicles.find(x=>x.id===s.vehicle_id);const net=Number(s.gross_income_minor)-Number(s.energy_cost_minor)-Number(s.extra_work_cost_minor);const meta=date(s.worked_on,{day:'2-digit',month:'short',year:'numeric'})+' · '+(v?.name||'')+' · '+(Number(s.minutes_worked)/60).toFixed(1)+'h'+(Number(s.distance_km)>0?' · '+Number(s.distance_km)+' km':'');return <article className="workSessionCard" key={s.id}><div className="workSessionMain"><div><b>{src}</b><small>{meta}</small></div><strong className={net>=0?'positive':'negative'}>{currency(net)}</strong></div><div className="workSessionActions"><button onClick={()=>startEdit(s)}>{t('common.edit')}</button><button className="dangerText" onClick={()=>deleteSession(s)}>{t('common.delete')}</button></div></article>})}</div>}</section>

    {editing&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><form className="modalCard" onSubmit={updateSession}><div className="modalHead"><h2>{t('common.edit')} · {t('home.work')}</h2><button type="button" onClick={()=>setEditing(null)}>×</button></div><label>{t('common.date')}<input type="date" value={eDate} onChange={e=>setEDate(e.target.value)}/></label><label>{t('work.source')}<select value={eSource} onChange={e=>{setESource(e.target.value);setEKm('');setEPct('')}}><option value="">—</option>{sources.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{editUsesVehicle&&<><label>{t('work.vehicleInUse')}<select value={eVehicle} onChange={e=>setEVehicle(e.target.value)}>{vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></>}<label>{t('work.gross')}<input value={eGross} onChange={e=>setEGross(e.target.value)} inputMode="decimal"/></label><label>{t('work.hours')}<input value={eHours} onChange={e=>setEHours(e.target.value)} inputMode="decimal"/></label>{editUsesVehicle&&<><label>{t('work.km')}<input value={eKm} onChange={e=>setEKm(e.target.value)} inputMode="decimal"/></label><label>{t('work.percent')}<input value={ePct} onChange={e=>setEPct(e.target.value)} inputMode="decimal"/></label></>}<label>{t('work.extra')}<input value={eExtra} onChange={e=>setEExtra(e.target.value)} inputMode="decimal"/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>{t('common.cancel')}</button><button className="primary">{t('common.save')}</button></div></form></div>}
  </div>;
}
