import './globals.css';
import type {Metadata} from 'next';

export const metadata:Metadata={
  title:'Sentinel Trading Lab',
  description:'Private trading automation research console',
  icons:{icon:'/favicon.ico',shortcut:'/favicon.ico',apple:'/favicon.ico'}
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="pt-BR"><body>{children}</body></html>
}
