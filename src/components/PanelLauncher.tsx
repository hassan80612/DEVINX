'use client';

import Link from 'next/link';
import {useI18n} from '@/i18n/provider';

export function PanelLauncher(){
  const{messages:m}=useI18n();
  const items=[
    {href:'/rendas',icon:'↗',title:m.pages.incomeTitle,description:m.pages.incomeLead,tone:'income'},
    {href:'/gastos',icon:'↘',title:m.pages.expensesTitle,description:m.pages.expensesLead,tone:'expense'},
    {href:'/trabalho',icon:'◈',title:m.pages.workTitle,description:m.pages.workLead,tone:'work'},
    {href:'/metas',icon:'◎',title:m.pages.goalsTitle,description:m.pages.goalsLead,tone:'goal'},
    {href:'/cartoes',icon:'▣',title:m.pages.cardsTitle,description:m.pages.cardsLead,tone:'card'},
    {href:'/recorrentes',icon:'↻',title:m.pages.recurringTitle,description:m.pages.recurringLead,tone:'recurring'},
    {href:'/dividas',icon:'↓',title:m.pages.debtsTitle,description:m.pages.debtsLead,tone:'debt'},
    {href:'/posso-gastar',icon:'?',title:m.pages.spendTitle,description:m.pages.spendLead,tone:'spend'},
    {href:'/relatorios',icon:'▥',title:m.pages.reportsTitle,description:m.pages.reportsLead,tone:'report'}
  ] as const;

  return <section className="panelLauncher">
    <div className="launcherHeading"><div><small>SEUS PAINÉIS</small><h2>Escolha uma área</h2></div><span>Tudo organizado sem misturar trabalho, contas e vida pessoal.</span></div>
    <div className="launcherGrid">{items.map(item=><Link href={item.href} key={item.href} className={`launcherCard ${item.tone}`}><i>{item.icon}</i><div><b>{item.title}</b><p>{item.description}</p></div><em>›</em></Link>)}</div>
  </section>;
}
