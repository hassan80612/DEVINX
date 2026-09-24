import './globals.css';
import type {Metadata} from 'next';
import {Analytics} from '@vercel/analytics/next';
import {I18nProvider} from '@/i18n/provider';
import {PresenceProvider} from '@/components/LivePresence';

const title='DevinX | Financeiro e Loja';
const description='DevinX reúne duas ferramentas independentes: Financeiro para organizar sua vida financeira e Loja para organizar produtos, estoque e vendas.';

export const metadata:Metadata={
  metadataBase:new URL('https://devinx.com.br'),
  applicationName:'DevinX',
  title:{
    default:title,
    template:'%s | DevinX'
  },
  description,
  keywords:[
    'controle financeiro',
    'controle de gastos',
    'meta diária financeira',
    'quanto preciso ganhar por dia',
    'finanças pessoais',
    'controle financeiro autônomo',
    'controle financeiro motorista de aplicativo',
    'controle financeiro Uber',
    'organizar contas'
  ],
  category:'business',
  alternates:{canonical:'/'},
  robots:{
    index:true,
    follow:true,
    googleBot:{
      index:true,
      follow:true,
      'max-image-preview':'large',
      'max-snippet':-1,
      'max-video-preview':-1
    }
  },
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

const softwareApplicationJsonLd={
  '@context':'https://schema.org',
  '@type':'SoftwareApplication',
  name:'DevinX',
  url:'https://devinx.com.br',
  applicationCategory:'BusinessApplication',
  operatingSystem:'Web',
  inLanguage:'pt-BR',
  description
};

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="pt-BR" dir="ltr"><body>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html:JSON.stringify(softwareApplicationJsonLd)}}
    />
    <I18nProvider><PresenceProvider>{children}</PresenceProvider></I18nProvider>
    <Analytics/>
  </body></html>
}
