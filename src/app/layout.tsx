import './globals.css';
import './hub.css';
import './theme.css';
import type {Metadata} from 'next';
import {Analytics} from '@vercel/analytics/next';
import {I18nProvider} from '@/i18n/provider';
import {PresenceProvider} from '@/components/LivePresence';

const title='Devinx | Seu dinheiro. Mais claro.';
const description='Controle entradas, saídas, trabalho, cartões, contas, reservas e histórico em um só lugar.';

export const metadata:Metadata={
  metadataBase:new URL('https://devinx.com.br'),
  title,
  description,
  alternates:{canonical:'/'},
  openGraph:{
    title,
    description,
    url:'/',
    siteName:'DEVINX',
    locale:'pt_BR',
    type:'website'
  },
  twitter:{
    card:'summary_large_image',
    title,
    description
  }
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="pt-BR" dir="ltr"><body><I18nProvider><PresenceProvider>{children}</PresenceProvider></I18nProvider><Analytics/></body></html>
}
