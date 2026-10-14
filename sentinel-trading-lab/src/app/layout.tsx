import './globals.css';
import type {Metadata} from 'next';
import {SentinelLocaleProvider} from '../components/SentinelLocale';

export const metadata:Metadata={
  title:'DevinX Trading Lab',
  applicationName:'DevinX Trading Lab',
  openGraph:{title:'DevinX Trading Lab',siteName:'DevinX Trading Lab',type:'website'},
  description:'Análise técnica em tempo real com Agent Windows, alertas CALL/PUT e acompanhamento pelo celular. As operações são manuais; resultados não são garantidos.',
  icons:{icon:'/devinx-icon.svg',shortcut:'/devinx-icon.svg',apple:'/devinx-icon.svg'}
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body><SentinelLocaleProvider>{children}</SentinelLocaleProvider></body></html>
}
