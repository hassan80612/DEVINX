'use client';

import {useMemo,useState} from 'react';
import {DashboardOverview} from '@/components/DashboardOverview';
import {TransactionManager} from '@/components/TransactionManager';
import {WorkManager} from '@/components/WorkManager';
import {GoalManager} from '@/components/GoalManager';
import {CardManager} from '@/components/CardManager';
import {DebtManager} from '@/components/DebtManager';
import {RecurringManager} from '@/components/RecurringManager';
import {ReportManager} from '@/components/ReportManager';
import {SpendCheck} from '@/components/SpendCheck';
import {CategoryManager} from '@/components/CategoryManager';
import {PreferencesManager} from '@/components/PreferencesManager';
import {QuickCapture} from '@/components/QuickCapture';

type Section='home'|'money'|'work'|'plan'|'more'|'cards'|'debts'|'recurring'|'reports'|'spend'|'categories'|'preferences';
type MoneyKind='income'|'expense';
type CaptureRequest={id:number;mode:MoneyKind};

const sectionTitles:Record<Section,string>={
  home:'Visão geral',
  money:'Entradas e gastos',
  work:'Trabalho',
  plan:'Planejamento',
  more:'Organizar',
  cards:'Cartões e parcelas',
  debts:'Outras dívidas',
  recurring:'Contas mensais',
  reports:'Relatórios',
  spend:'Posso gastar?',
  categories:'Categorias',
  preferences:'Preferências'
};

export function FinanceHub(){
  const[section,setSection]=useState<Section>('home');
  const[moneyKind,setMoneyKind]=useState<MoneyKind>('expense');
  const[capture,setCapture]=useState<CaptureRequest>({id:0,mode:'expense'});
  const month=useMemo(()=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date()),[]);

  function openCapture(mode:MoneyKind){
    setCapture(current=>({id:current.id+1,mode}));
  }

  function navigate(target:string){
    if(target==='income'||target==='expense'){
      setMoneyKind(target);
      setSection('money');
      return;
    }
    const allowed:Section[]=['home','money','work','plan','more','cards','debts','recurring','reports','spend','categories','preferences'];
    if(allowed.includes(target as Section))setSection(target as Section);
  }

  function backTarget(){
    if(['cards','debts','recurring','reports','spend','categories','preferences'].includes(section))return 'more';
    return 'home';
  }

  return <main className="financeApp">
    <header className="financeHeader">
      <button className="brand brandButton" onClick={()=>setSection('home')} type="button"><span className="mark">D</span><b>DEVINX</b></button>
      <div className="financeHeaderMeta"><small>{month}</small><span>Seu dinheiro, sem enrolação.</span></div>
    </header>

    <section className="financeContent">
      {section!=='home'&&<div className="sectionTopbar"><button type="button" className="backButton" onClick={()=>setSection(backTarget())}>‹</button><div><small>DEVINX</small><h1>{sectionTitles[section]}</h1></div></div>}

      {section==='home'&&<>
        <section className="instantPanel">
          <div><small>REGISTRO EM SEGUNDOS</small><h1>O que aconteceu agora?</h1><p>Abra, toque e registre. Sem procurar menu.</p></div>
          <div className="instantActions">
            <button type="button" className="instantAction income" onClick={()=>openCapture('income')}><span>＋</span><b>Entrada</b><small>dinheiro que entrou</small></button>
            <button type="button" className="instantAction expense" onClick={()=>openCapture('expense')}><span>−</span><b>Gasto</b><small>dinheiro que saiu</small></button>
            <button type="button" className="instantAction work" onClick={()=>setSection('work')}><span>◷</span><b>Jornada</b><small>Uber, 99, entrega...</small></button>
            <button type="button" className="instantAction card" onClick={()=>setSection('cards')}><span>▣</span><b>Cartão</b><small>parcelas e fatura</small></button>
          </div>
        </section>
        <DashboardOverview/>
      </>}

      {section==='money'&&<>
        <div className="segmentControl">
          <button type="button" className={moneyKind==='expense'?'active':''} onClick={()=>setMoneyKind('expense')}>Gastos</button>
          <button type="button" className={moneyKind==='income'?'active':''} onClick={()=>setMoneyKind('income')}>Entradas</button>
        </div>
        <TransactionManager kind={moneyKind} onNavigate={navigate}/>
      </>}

      {section==='work'&&<><p className="sectionLead">Registre ganhos, horas e quilômetros. O Devinx calcula o que realmente sobrou do trabalho.</p><WorkManager/></>}
      {section==='plan'&&<div className="stackSections"><section><div className="miniHeading"><small>OBJETIVOS</small><h2>Metas</h2></div><GoalManager/></section><section><div className="miniHeading"><small>ANTES DE COMPRAR</small><h2>Posso gastar?</h2></div><SpendCheck/></section></div>}

      {section==='more'&&<section className="organizeGrid">
        <button onClick={()=>setSection('cards')} type="button"><span>▣</span><div><b>Cartões e parcelas</b><small>Veja o que vence agora e o que ainda vem pela frente.</small></div><em>›</em></button>
        <button onClick={()=>setSection('debts')} type="button"><span>↓</span><div><b>Outras dívidas</b><small>Financiamentos, empréstimos e acordos.</small></div><em>›</em></button>
        <button onClick={()=>setSection('recurring')} type="button"><span>↻</span><div><b>Contas mensais</b><small>Aluguel, internet, escola e outras recorrências.</small></div><em>›</em></button>
        <button onClick={()=>setSection('reports')} type="button"><span>▥</span><div><b>Relatórios</b><small>Entenda para onde o dinheiro está indo.</small></div><em>›</em></button>
        <button onClick={()=>setSection('categories')} type="button"><span>⌁</span><div><b>Categorias</b><small>Organize sem complicar o registro rápido.</small></div><em>›</em></button>
        <button onClick={()=>setSection('preferences')} type="button"><span>⚙</span><div><b>Preferências</b><small>Conta, moeda e configurações essenciais.</small></div><em>›</em></button>
      </section>}

      {section==='cards'&&<CardManager onNavigate={navigate}/>}
      {section==='debts'&&<DebtManager/>}
      {section==='recurring'&&<RecurringManager onNavigate={navigate}/>}
      {section==='reports'&&<ReportManager/>}
      {section==='spend'&&<SpendCheck/>}
      {section==='categories'&&<CategoryManager/>}
      {section==='preferences'&&<PreferencesManager/>}
    </section>

    <QuickCapture request={capture} onNavigate={navigate}/>

    <nav className="financeBottomNav" aria-label="Navegação principal">
      <button type="button" className={section==='home'?'active':''} onClick={()=>setSection('home')}><span>⌂</span><b>Início</b></button>
      <button type="button" className={section==='money'?'active':''} onClick={()=>setSection('money')}><span>↕</span><b>Movimentos</b></button>
      <button type="button" className={section==='work'?'active':''} onClick={()=>setSection('work')}><span>◷</span><b>Trabalho</b></button>
      <button type="button" className={section==='plan'?'active':''} onClick={()=>setSection('plan')}><span>◎</span><b>Planejar</b></button>
      <button type="button" className={section==='more'||['cards','debts','recurring','reports','spend','categories','preferences'].includes(section)?'active':''} onClick={()=>setSection('more')}><span>•••</span><b>Mais</b></button>
    </nav>
  </main>;
}
