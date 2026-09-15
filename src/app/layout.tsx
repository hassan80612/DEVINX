import './globals.css';
import './modules.css';
import './auth.css';
import './quick-capture.css';
import type {Metadata} from 'next';
import {I18nProvider} from '@/i18n/provider';

export const metadata:Metadata={title:'Devinx | Sua vida financeira em um só lugar',description:'Controle rendas, gastos, trabalho, metas, cartões e dívidas em um só lugar.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR" dir="ltr"><body><I18nProvider>{children}</I18nProvider></body></html>}
