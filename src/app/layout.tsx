import './globals.css';
import './hub.css';
import './premium-theme.css';
import type {Metadata} from 'next';
import {I18nProvider} from '@/i18n/provider';

export const metadata:Metadata={title:'Devinx | Seu dinheiro. Mais claro.',description:'Controle entradas, saídas, trabalho, cartões, contas, reservas e histórico em um só lugar.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR" dir="ltr"><body><I18nProvider>{children}</I18nProvider></body></html>}
