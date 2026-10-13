import './globals.css';
import type {Metadata} from 'next';
import {SentinelLocaleProvider} from '../components/SentinelLocale';

export const metadata:Metadata={
  title:'Sentinel Trading Lab',
  description:'Análise técnica em tempo real com Agent Windows, alertas CALL/PUT e acompanhamento pelo celular. As operações são manuais; resultados não são garantidos.',
  icons:{icon:'/favicon.ico',shortcut:'/favicon.ico',apple:'/favicon.ico'}
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body><SentinelLocaleProvider>{children}</SentinelLocaleProvider></body></html>
}
