'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/i18n/provider';
import {QuickCapture} from '@/components/QuickCapture';

type TitleKey=keyof ReturnType<typeof useI18n>['messages']['pages'];

export function AppShell({titleKey,children}:{titleKey:TitleKey;children:React.ReactNode}){
  const pathname=usePathname();
  const{locale,messages:m}=useI18n();
  const nav=[['/painel',m.nav.home],['/rendas',m.nav.income],['/gastos',m.nav.expenses],['/metas',m.nav.goals],['/mais',m.nav.more]] as const;
  const month=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'}).format(new Date()).toUpperCase();

  return <main className="appShell">
    <header className="appHeader">
      <Link href="/painel" className="brand"><span className="mark">D</span><b>{m.app.name}</b></Link>
      <div className="appHeaderActions">
        {pathname!=='/painel'&&<Link href="/painel" className="headerHome">⌂ <span>{m.nav.home}</span></Link>}
        <span className="month">{month}</span>
      </div>
    </header>
    <section className="appContent"><div className="pageHeading"><h1>{m.pages[titleKey]}</h1></div>{children}</section>
    <QuickCapture/>
    <nav className="bottomNav">{nav.map(([href,label])=><Link href={href} key={href} className={pathname===href||pathname.startsWith(href+'/')?'active':''}>{label}</Link>)}</nav>
  </main>;
}
