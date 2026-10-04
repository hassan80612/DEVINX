import './globals.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Sentinel Trading Lab',description:'Private trading automation research console'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
