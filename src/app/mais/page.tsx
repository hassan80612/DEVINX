import Link from 'next/link';
import {AppShell} from '@/components/AppShell';

const items=[
  ['💳','Cartões','Faturas, limites e parcelas','/cartoes'],
  ['↻','Contas recorrentes','Configure uma vez e acompanhe todo mês','/recorrentes'],
  ['📉','Dívidas','Empréstimos, financiamentos e acordos','/dividas'],
  ['🧮','Posso gastar?','Veja o impacto antes de decidir','/posso-gastar'],
  ['📊','Relatórios','Mês, 3, 6 e 12 meses','/relatorios'],
  ['⚙','Preferências','Moeda, idioma e configurações','/preferencias']
] as const;

export default function Mais(){
  return <AppShell titleKey="moreTitle">
    <div className="menuList">
      {items.map(([i,n,d,path])=><Link href={path} key={n} className="menuItem"><span>{i}</span><div><b>{n}</b><small>{d}</small></div><em>›</em></Link>)}
    </div>
  </AppShell>
}
