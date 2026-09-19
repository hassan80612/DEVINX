'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {hoursToGoal} from '@/domain/finance';

type Vehicle={id:string;name:string;vehicle_type:'car'|'motorcycle'|'bicycle';energy_type:string;efficiency:number|null;unit_price_minor:number|null;is_default:boolean};
type Source={id:string;name:string;kind:'driver'|'delivery'};
type Session={id:string;vehicle_id:string|null;gross_income_minor:number;energy_cost_minor:number;extra_work_cost_minor:number;distance_km:number;minutes_worked:number;worked_on:string;income_source_id:string|null};
type Goal={name:string;target_minor:number;basis:string;period:string};

const brl=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v/100);
const minor=(raw:string)=>Math.round((Number(raw.replace(/\./g,'').replace(',','.'))||0)*100);
const decimal=(raw:string)=>Number(raw.replace(',','.'))||0;
const isoDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function periodStart(period:string){const d=new Date();if(period==='daily')return isoDate(d);if(period==='weekly'){const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return isoDate(d)}d.setDate(1);return isoDate(d)}
const vehicleLabel=(type:string)=>type==='motorcycle'?'Moto':type==='bicycle'?'Bicicleta':'Carro';
const energyLabel=(type:string)=>({gasoline:'Gasolina',ethanol:'Etanol',diesel:'Diesel',hybrid:'Híbrido',electric:'Elétrico',human:'Sem combustível'}[type]||type);

function energyCostFor(vehicle:Vehicle,distanceKm:number,manualMinor:number){
  if(vehicle.energy_type==='human')return 0;
  if(manualMinor>0)return manualMinor;
  const efficiency=Number(vehicle.efficiency)||0;
  const price=Number(vehicle.unit_price_minor)||0;
  if(distanceKm<=0||efficiency<=0||price<=0)return 0;
  return Math.round((distanceKm/efficiency)*price);
}

export function WorkManager(){
  const[vehicles,setVehicles]=useState<Vehicle[]>([]);
  const[selectedVehicleId,setSelectedVehicleId]=useState('');
  const[vehicleFormMode,setVehicleFormMode]=useState<'new'|'edit'|null>(null);
  const[sources,setSources]=useState<Source[]>([]);
  const[sessions,setSessions]=useState<Session[]>([]);
  const[history,setHistory]=useState<Session[]>([]);
  const[goal,setGoal]=useState<Goal|null>(null);

  const[name,setName]=useState('Meu carro');
  const[vehicleType,setVehicleType]=useState<'car'|'motorcycle'|'bicycle'>('car');
  const[energy,setEnergy]=useState('gasoline');
  const[efficiency,setEfficiency]=useState('');
  const[unitPrice,setUnitPrice]=useState('');

  const[sourceId,setSourceId]=useState('');
  const[newSource,setNewSource]=useState('');
  const[newSourceKind,setNewSourceKind]=useState<'driver'|'delivery'>('driver');
  const[gross,setGross]=useState('');
  const[km,setKm]=useState('');
  const[energySpent,setEnergySpent]=useState('');
  const[hours,setHours]=useState('');
  const[extra,setExtra]=useState('0');
  const[notice,setNotice]=useState('');

  const[editingSessionId,setEditingSessionId]=useState<string|null>(null);
  const[editVehicleId,setEditVehicleId]=useState('');
  const[editGross,setEditGross]=useState('');
  const[editKm,setEditKm]=useState('');
  const[editEnergySpent,setEditEnergySpent]=useState('');
  const[editHours,setEditHours]=useState('');
  const[editExtra,setEditExtra]=useState('');
  const[editDate,setEditDate]=useState('');
  const[editSourceId,setEditSourceId]=useState('');
  const[editingSession,setEditingSession]=useState(false);

  const vehicle=useMemo(()=>vehicles.find(v=>v.id===selectedVehicleId)||vehicles[0]||null,[vehicles,selectedVehicleId]);

  function fillVehicleForm(v:Vehicle){
    setName(v.name);
    setVehicleType(v.vehicle_type||'car');
    setEnergy(v.energy_type);
    setEfficiency(v.efficiency==null?'':String(v.efficiency));
    setUnitPrice(v.unit_price_minor==null?'':String(Number(v.unit_price_minor)/100).replace('.',','));
  }

  function resetVehicleForm(){
    setName('Meu carro');setVehicleType('car');setEnergy('gasoline');setEfficiency('');setUnitPrice('');
  }

  async function load(){
    const s=createClient();
    const{data:{user}}=await s.auth.getUser();
    if(!user){location.href='/entrar';return}
    const since=new Date();since.setDate(since.getDate()-30);
    const[v,src,ss,hist,g]=await Promise.all([
      s.from('vehicles').select('id,name,vehicle_type,energy_type,efficiency,unit_price_minor,is_default').eq('user_id',user.id).order('is_default',{ascending:false}).order('created_at'),
      s.from('income_sources').select('id,name,kind').eq('user_id',user.id).in('kind',['driver','delivery']).eq('is_active',true).order('created_at'),
      s.from('work_sessions').select('id,vehicle_id,gross_income_minor,energy_cost_minor,extra_work_cost_minor,distance_km,minutes_worked,worked_on,income_source_id').eq('user_id',user.id).gte('worked_on',isoDate(since)).order('worked_on',{ascending:false}),
      s.from('work_sessions').select('id,vehicle_id,gross_income_minor,energy_cost_minor,extra_work_cost_minor,distance_km,minutes_worked,worked_on,income_source_id').eq('user_id',user.id).order('worked_on',{ascending:false}).limit(30),
      s.from('goals').select('name,target_minor,basis,period').eq('user_id',user.id).eq('is_active',true).in('basis',['gross','operational_net']).limit(1)
    ]);
    const vehicleRows=(v.data||[]) as Vehicle[];
    const sourceRows=(src.data||[]) as Source[];
    setVehicles(vehicleRows);
    const fallback=vehicleRows.find(item=>item.is_default)?.id||vehicleRows[0]?.id||'';
    setSelectedVehicleId(current=>vehicleRows.some(item=>item.id===current)?current:fallback);
    if(vehicleRows.length===0){setVehicleFormMode('new');resetVehicleForm()}
    setSources(sourceRows);
    setSessions((ss.data||[]) as Session[]);
    setHistory((hist.data||[]) as Session[]);
    setGoal((g.data?.[0] as Goal)||null);
    setSourceId(current=>current||sourceRows[0]?.id||'');
  }

  useEffect(()=>{load()},[]);

  const stats=useMemo(()=>{
    const grossIncome=sessions.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const energyCost=sessions.reduce((a,b)=>a+Number(b.energy_cost_minor),0);
    const extraCost=sessions.reduce((a,b)=>a+Number(b.extra_work_cost_minor),0);
    const distance=sessions.reduce((a,b)=>a+Number(b.distance_km),0);
    const workedHours=sessions.reduce((a,b)=>a+Number(b.minutes_worked),0)/60;
    const operationalCost=energyCost+extraCost;
    const net=grossIncome-operationalCost;
    return{gross:grossIncome,energyCost,extraCost,operationalCost,distance,h:workedHours,net,grossPerHour:workedHours>0?grossIncome/workedHours:0,netPerHour:workedHours>0?net/workedHours:0,perKm:distance>0?net/distance:0}
  },[sessions]);

  const sourceStats=useMemo(()=>sources.map(source=>{
    const rows=sessions.filter(s=>s.income_source_id===source.id);
    const h=rows.reduce((a,b)=>a+Number(b.minutes_worked),0)/60;
    const grossIncome=rows.reduce((a,b)=>a+Number(b.gross_income_minor),0);
    const cost=rows.reduce((a,b)=>a+Number(b.energy_cost_minor)+Number(b.extra_work_cost_minor),0);
    const net=grossIncome-cost;
    return{id:source.id,name:source.name,h,netPerHour:h>0?net/h:0}
  }).filter(x=>x.h>0),[sources,sessions]);

  const goalForecast=useMemo(()=>{
    if(!goal)return null;
    const start=periodStart(goal.period);
    const current=sessions.filter(s=>s.worked_on>=start).reduce((sum,s)=>sum+(goal.basis==='gross'?Number(s.gross_income_minor):Number(s.gross_income_minor)-Number(s.energy_cost_minor)-Number(s.extra_work_cost_minor)),0);
    const remaining=Math.max(0,Number(goal.target_minor)-current);
    const historyReady=sessions.length>=3&&stats.h>=3;
    const rate=goal.basis==='gross'?stats.grossPerHour:stats.netPerHour;
    return{current,remaining,historyReady,hours:historyReady?hoursToGoal(remaining,rate):null}
  },[goal,sessions,stats]);

  function changeVehicleType(type:'car'|'motorcycle'|'bicycle'){
    setVehicleType(type);
    if(type==='bicycle')setEnergy('human');
    else if(energy==='human')setEnergy('gasoline');
    if(vehicleFormMode==='new')setName(type==='motorcycle'?'Minha moto':type==='bicycle'?'Minha bicicleta':'Meu carro');
  }

  async function selectVehicle(id:string){
    setSelectedVehicleId(id);setNotice('');
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    await s.from('vehicles').update({is_default:false}).eq('user_id',user.id);
    await s.from('vehicles').update({is_default:true}).eq('id',id).eq('user_id',user.id);
    setVehicles(current=>current.map(item=>({...item,is_default:item.id===id})));
  }

  function startAddVehicle(){resetVehicleForm();setVehicleFormMode('new');setNotice('')}
  function startEditVehicle(){if(!vehicle)return;fillVehicleForm(vehicle);setVehicleFormMode('edit');setNotice('')}

  async function saveVehicle(e:FormEvent){
    e.preventDefault();
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const actualEnergy=vehicleType==='bicycle'?'human':energy;
    if(actualEnergy!=='human'&&(decimal(efficiency)<=0||minor(unitPrice)<=0)){setNotice('Informe o consumo real e o preço atual deste veículo.');return}
    const payload={name:name.trim()||'Meu veículo',vehicle_type:vehicleType,energy_type:actualEnergy,efficiency:actualEnergy==='human'?null:decimal(efficiency),unit_price_minor:actualEnergy==='human'?0:minor(unitPrice),is_default:true};
    await s.from('vehicles').update({is_default:false}).eq('user_id',user.id);
    let newId=selectedVehicleId;let error;
    if(vehicleFormMode==='edit'&&vehicle){
      ({error}=await s.from('vehicles').update(payload).eq('id',vehicle.id).eq('user_id',user.id));
      newId=vehicle.id;
    }else{
      const result=await s.from('vehicles').insert({user_id:user.id,...payload}).select('id').single();
      error=result.error;newId=result.data?.id||'';
    }
    if(error){setNotice('Não foi possível salvar o veículo.');return}
    setSelectedVehicleId(newId);setVehicleFormMode(null);
    setNotice('Veículo salvo e pronto para usar nas jornadas.');
    await load();
  }

  async function addSource(){
    const value=newSource.trim();if(!value)return;
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('income_sources').upsert({user_id:user.id,kind:newSourceKind,name:value},{onConflict:'user_id,kind,name',ignoreDuplicates:true});
    if(error){setNotice('Não foi possível adicionar a fonte.');return}
    setNewSource('');await load();
  }

  async function saveSession(e:FormEvent){
    e.preventDefault();
    if(!vehicle){setNotice('Escolha um veículo primeiro.');return}
    const enteredDistance=decimal(km);
    const workedHours=decimal(hours);
    const manualEnergy=minor(energySpent);
    if(workedHours<=0){setNotice('Informe as horas trabalhadas.');return}
    if(vehicle.energy_type!=='human'&&enteredDistance<=0&&manualEnergy<=0){setNotice('Informe os quilômetros rodados para o Devinx calcular o combustível automaticamente.');return}
    const energyCost=energyCostFor(vehicle,enteredDistance,manualEnergy);
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user)return;
    const{error}=await s.from('work_sessions').insert({user_id:user.id,vehicle_id:vehicle.id,income_source_id:sourceId||null,worked_on:isoDate(new Date()),gross_income_minor:minor(gross),energy_cost_minor:energyCost,extra_work_cost_minor:minor(extra),distance_km:Number(enteredDistance.toFixed(2)),minutes_worked:Math.round(workedHours*60)});
    if(error){setNotice('Não foi possível salvar a jornada.');return}
    const net=minor(gross)-energyCost-minor(extra);
    setGross('');setKm('');setEnergySpent('');setHours('');setExtra('0');
    setNotice('Jornada salva. Combustível '+brl(energyCost)+' · líquido '+brl(net)+'.');
    window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  function sessionSourceName(id:string|null){return sources.find(source=>source.id===id)?.name||'Trabalho'}
  function sessionVehicle(id:string|null){return vehicles.find(item=>item.id===id)||null}
  function sessionVehicleName(id:string|null){const v=sessionVehicle(id);return v?v.name:'Veículo não identificado'}

  function startSessionEdit(session:Session){
    setEditingSessionId(session.id);setEditVehicleId(session.vehicle_id||selectedVehicleId);
    setEditGross(String(Number(session.gross_income_minor)/100).replace('.',','));
    setEditKm(String(Number(session.distance_km)).replace('.',','));
    setEditEnergySpent('');
    setEditHours(String(Number(session.minutes_worked)/60).replace('.',','));
    setEditExtra(String(Number(session.extra_work_cost_minor)/100).replace('.',','));
    setEditDate(session.worked_on);setEditSourceId(session.income_source_id||'');setNotice('');
  }
  function cancelSessionEdit(){setEditingSessionId(null);setEditVehicleId('');setEditGross('');setEditKm('');setEditEnergySpent('');setEditHours('');setEditExtra('');setEditDate('');setEditSourceId('')}

  async function updateSession(e:FormEvent,session:Session){
    e.preventDefault();
    const editVehicle=vehicles.find(item=>item.id===editVehicleId)||vehicle;
    if(!editVehicle)return;
    const workedHours=decimal(editHours);const enteredDistance=decimal(editKm);const manualEnergy=minor(editEnergySpent);
    if(workedHours<=0){setNotice('Informe as horas trabalhadas.');return}
    if(editVehicle.energy_type!=='human'&&enteredDistance<=0&&manualEnergy<=0){setNotice('Informe os quilômetros rodados para recalcular o combustível.');return}
    const energyCost=energyCostFor(editVehicle,enteredDistance,manualEnergy);
    setEditingSession(true);
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const{error}=await s.from('work_sessions').update({vehicle_id:editVehicle.id,income_source_id:editSourceId||null,worked_on:editDate,gross_income_minor:minor(editGross),energy_cost_minor:energyCost,extra_work_cost_minor:minor(editExtra),distance_km:Number(enteredDistance.toFixed(2)),minutes_worked:Math.round(workedHours*60)}).eq('id',session.id).eq('user_id',user.id);
    setEditingSession(false);
    if(error){setNotice('Não foi possível atualizar a jornada.');return}
    cancelSessionEdit();setNotice('Jornada atualizada e combustível recalculado.');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  async function deleteSession(session:Session){
    if(!window.confirm('Excluir a jornada de '+new Date(session.worked_on+'T12:00:00').toLocaleDateString('pt-BR')+'?'))return;
    const s=createClient();const{data:{user}}=await s.auth.getUser();if(!user){location.href='/entrar';return}
    const{error}=await s.from('work_sessions').delete().eq('id',session.id).eq('user_id',user.id);
    if(error){setNotice('Não foi possível excluir a jornada.');return}
    if(editingSessionId===session.id)cancelSessionEdit();
    setNotice('Jornada excluída e indicadores recalculados.');window.dispatchEvent(new CustomEvent('devinx:finance-updated'));await load();
  }

  const showVehicleForm=vehicleFormMode!==null||vehicles.length===0;

  return <>
    {showVehicleForm?<section className="panel vehicleSetup">
      <div className="sectionHeading"><div><small>VEÍCULO</small><h2>{vehicleFormMode==='edit'?'Editar veículo':'Adicionar veículo'}</h2></div>{vehicles.length>0&&<button type="button" className="textButton" onClick={()=>setVehicleFormMode(null)}>Cancelar</button>}</div>
      <p className="lead">Cadastre consumo e preço uma vez. Cada veículo mantém seus próprios números.</p>
      <form className="entryForm" onSubmit={saveVehicle}>
        <label>Tipo<select value={vehicleType} onChange={e=>changeVehicleType(e.target.value as 'car'|'motorcycle'|'bicycle')}><option value="car">Carro</option><option value="motorcycle">Moto</option><option value="bicycle">Bicicleta</option></select></label>
        <label>Nome<input value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Ford Ka 2017"/></label>
        {vehicleType!=='bicycle'&&<><label>Combustível / energia<select value={energy} onChange={e=>setEnergy(e.target.value)}><option value="gasoline">Gasolina</option><option value="ethanol">Etanol</option><option value="diesel">Diesel</option><option value="hybrid">Híbrido</option><option value="electric">Elétrico</option></select></label><label>{energy==='electric'?'Km por kWh':'Km por litro'}<input required value={efficiency} onChange={e=>setEfficiency(e.target.value)} inputMode="decimal" placeholder={energy==='electric'?'Ex.: 6,5':'Ex.: 11,5'}/></label><label>{energy==='electric'?'Preço do kWh':'Preço por litro'}<input required value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} inputMode="decimal" placeholder="Ex.: 6,19"/></label></>}
        <button className="primary">Salvar veículo</button>
      </form>
    </section>:vehicle&&<section className="vehicleSummary vehicleSwitcher">
      <div className="vehicleSelectBlock"><small>VEÍCULO EM USO</small>{vehicles.length>1?<select value={vehicle.id} onChange={e=>selectVehicle(e.target.value)}>{vehicles.map(item=><option value={item.id} key={item.id}>{vehicleLabel(item.vehicle_type)} · {item.name}</option>)}</select>:<b>{vehicleLabel(vehicle.vehicle_type)} · {vehicle.name}</b>}<span>{energyLabel(vehicle.energy_type)}{vehicle.energy_type!=='human'&&vehicle.efficiency?` · ${vehicle.efficiency} ${vehicle.energy_type==='electric'?'km/kWh':'km/L'}`:''}{vehicle.energy_type!=='human'&&vehicle.unit_price_minor?` · ${brl(Number(vehicle.unit_price_minor))}/${vehicle.energy_type==='electric'?'kWh':'L'}`:''}</span></div>
      <div className="vehicleButtons"><button type="button" className="secondary" onClick={startEditVehicle}>Editar</button><button type="button" className="secondary" onClick={startAddVehicle}>+ Veículo</button></div>
    </section>}

    {vehicle&&!showVehicleForm&&<>
      <div className="metricGrid"><article><small>Líquido / hora</small><b>{stats.h?brl(Math.round(stats.netPerHour)):'—'}</b></article><article><small>Líquido / km</small><b>{stats.distance?brl(Math.round(stats.perKm)):'—'}</b></article><article><small>Combustível / energia</small><b>{brl(stats.energyCost)}</b></article><article><small>Líquido operacional</small><b>{brl(stats.net)}</b></article></div>

      {goal&&goalForecast&&<section className="panel"><h2>{goal.name}</h2><p className="lead">{brl(goalForecast.current)} de {brl(Number(goal.target_minor))} neste período.</p>{goalForecast.remaining===0?<div className="goalForecast good"><b>Meta alcançada</b><span>Você já atingiu essa meta.</span></div>:goalForecast.historyReady&&goalForecast.hours!==null?<div className="goalForecast"><b>Estimativa: {goalForecast.hours.toFixed(1)} h</b><span>Baseada apenas no seu próprio histórico dos últimos 30 dias.</span></div>:<div className="note">Registre pelo menos 3 jornadas e 3 horas de trabalho para o Devinx estimar quanto falta trabalhar.</div>}</section>}

      <section className="panel">
        <h2>Registrar jornada</h2>
        <p className="lead">Informe o bruto e os quilômetros. O Devinx calcula o combustível pelo veículo selecionado.</p>
        {vehicles.length>1&&<label className="standaloneLabel">Veículo<select value={vehicle.id} onChange={e=>selectVehicle(e.target.value)}>{vehicles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        {sources.length>0&&<label className="standaloneLabel">Fonte de renda<select value={sourceId} onChange={e=>setSourceId(e.target.value)}>{sources.map(source=><option value={source.id} key={source.id}>{source.name}</option>)}</select></label>}
        <form className="entryForm compactWorkForm" onSubmit={saveSession}>
          <label>Ganhos brutos<input required value={gross} onChange={e=>setGross(e.target.value)} placeholder="0,00" inputMode="decimal"/></label>
          <label>Horas trabalhadas<input required value={hours} onChange={e=>setHours(e.target.value)} placeholder="Ex.: 2" inputMode="decimal"/></label>
          {vehicle.energy_type!=='human'&&<label>Quilômetros rodados <small>(para calcular combustível)</small><input value={km} onChange={e=>setKm(e.target.value)} placeholder="Ex.: 18,4" inputMode="decimal"/></label>}
          {vehicle.energy_type!=='human'&&<label>Custo real de combustível desta jornada <small>(opcional)</small><input value={energySpent} onChange={e=>setEnergySpent(e.target.value)} placeholder="Só se souber o custo desta jornada" inputMode="decimal"/></label>}
          <label>Outros custos do trabalho <small>(opcional)</small><input value={extra} onChange={e=>setExtra(e.target.value)} placeholder="0,00" inputMode="decimal"/></label>
          <button className="primary">Salvar jornada</button>
        </form>
        {vehicle.energy_type!=='human'&&<p className="smartHint">Automático: km ÷ {vehicle.efficiency||'consumo'} × {brl(Number(vehicle.unit_price_minor||0))}/{vehicle.energy_type==='electric'?'kWh':'L'}. Abastecer o tanque não é o mesmo que consumir aquele valor nesta jornada.</p>}
        <div className="inlineAdd sourceAdd"><select value={newSourceKind} onChange={e=>setNewSourceKind(e.target.value as 'driver'|'delivery')}><option value="driver">Motorista</option><option value="delivery">Entregador</option></select><input value={newSource} onChange={e=>setNewSource(e.target.value)} placeholder="Adicionar outra fonte"/><button type="button" className="secondary" onClick={addSource}>Adicionar</button></div>
      </section>

      <section className="panel recentWorkPanel"><div className="sectionHeading"><div><small>HISTÓRICO</small><h2>Jornadas recentes</h2></div><span>{history.length} registros</span></div>{history.length===0?<div className="empty"><b>Nenhuma jornada registrada</b><p>Quando salvar a primeira, ela aparecerá aqui.</p></div>:<div className="workSessionList">{history.map(session=>{const net=Number(session.gross_income_minor)-Number(session.energy_cost_minor)-Number(session.extra_work_cost_minor);return <article key={session.id} className={editingSessionId===session.id?'workSessionCard editing':'workSessionCard'}><div className="workSessionMain"><div><b>{sessionSourceName(session.income_source_id)} · {sessionVehicleName(session.vehicle_id)}</b><small>{new Date(session.worked_on+'T12:00:00').toLocaleDateString('pt-BR')} · {(Number(session.minutes_worked)/60).toFixed(1)} h · {Number(session.distance_km).toFixed(1)} km</small><small>Bruto {brl(Number(session.gross_income_minor))} · combustível {brl(Number(session.energy_cost_minor))} · outros {brl(Number(session.extra_work_cost_minor))}</small></div><strong className={net>=0?'positive':'negative'}>{brl(net)}</strong></div><div className="workSessionActions"><button type="button" onClick={()=>editingSessionId===session.id?cancelSessionEdit():startSessionEdit(session)}>{editingSessionId===session.id?'Cancelar':'Editar'}</button><button type="button" className="dangerText" onClick={()=>deleteSession(session)}>Excluir</button></div>{editingSessionId===session.id&&<form className="workSessionEditForm" onSubmit={e=>updateSession(e,session)}>
            {vehicles.length>0&&<label>Veículo<select value={editVehicleId} onChange={e=>setEditVehicleId(e.target.value)}>{vehicles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
            {sources.length>0&&<label>Fonte<select value={editSourceId} onChange={e=>setEditSourceId(e.target.value)}><option value="">Trabalho</option>{sources.map(source=><option value={source.id} key={source.id}>{source.name}</option>)}</select></label>}
            <label>Data<input type="date" required value={editDate} onChange={e=>setEditDate(e.target.value)}/></label>
            <label>Ganhos<input required inputMode="decimal" value={editGross} onChange={e=>setEditGross(e.target.value)}/></label>
            <label>Horas<input required inputMode="decimal" value={editHours} onChange={e=>setEditHours(e.target.value)}/></label>
            <label>Quilômetros<input inputMode="decimal" value={editKm} onChange={e=>setEditKm(e.target.value)}/></label>
            {(vehicles.find(item=>item.id===editVehicleId)||vehicle).energy_type!=='human'&&<label>Custo real de combustível <small>(opcional)</small><input inputMode="decimal" value={editEnergySpent} onChange={e=>setEditEnergySpent(e.target.value)}/></label>}
            <label>Outros custos<input inputMode="decimal" value={editExtra} onChange={e=>setEditExtra(e.target.value)}/></label>
            <button className="primary" disabled={editingSession}>{editingSession?'Salvando...':'Salvar alteração'}</button>
          </form>}</article>})}</div>}</section>

      {sourceStats.length>=2&&<section className="panel"><h2>Comparação pelas suas fontes</h2><p className="lead">Somente com os seus próprios registros dos últimos 30 dias.</p><div className="sourceComparison">{sourceStats.map(source=><article key={source.id}><b>{source.name}</b><strong>{brl(Math.round(source.netPerHour))}/h</strong><small>{source.h.toFixed(1)} h registradas</small></article>)}</div></section>}
      <section className="note">O líquido operacional usa apenas combustível/energia calculado pelo veículo e custos que você informou. Não inventamos manutenção, pneus ou depreciação.</section>
    </>}

    {notice&&<div className="authMessage">{notice}</div>}
  </>;
}
