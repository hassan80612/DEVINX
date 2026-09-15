import './globals.css';
import './modules.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Devinx | Sua vida financeira em um só lugar',
  description: 'Controle rendas, gastos, trabalho, metas, cartões e dívidas em um só lugar.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
