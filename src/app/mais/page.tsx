'use client';

import Link from 'next/link';
import {AppShell} from '@/components/AppShell';
import {useI18n} from '@/i18n/provider';

export default function Mais(){
  const{messages:m}=useI18n();
  const items=[
    ['💳',m.more.cards,m.more.cardsHelp,'/cartoes'],
    ['↻',m.more.recurring,m.more.recurringHelp,'/recorrentes'],
    ['📉',m.more.debts,m.more.debtsHelp,'/dividas'],
    ['🧮',m.more.spend,m.more.spendHelp,'/posso-gastar'],
    ['📊',m.more.reports,m.more.reportsHelp,'/relatorios'],
    ['⚙',m.more.preferences,m.more.preferencesHelp,'/preferencias']
  ] as const;

  return <AppShell titleKey="moreTitle">
    <div className="menuList">{items.map(([icon,name,description,path])=><Link href={path} key={path} className="menuItem"><span>{icon}</span><div><b>{name}</b><small>{description}</small></div><em>›</em></Link>)}</div>
  </AppShell>;
}
