import {redirect} from 'next/navigation';
import type {Metadata} from 'next';

// Public DevinX entry point: send visitors directly to the verified Trading Lab domain.
// Keep the marketing page and account login on the same professional hostname.
export const metadata:Metadata={
  title:'Sentinel Trading Lab | DevinX',
  description:'Análise técnica de mercado com cenários CALL/PUT. Produto independente.'
};
export default async function SentinelEntry({
 searchParams
}:{searchParams:Promise<{next?:string}>}){
 const params=await searchParams;
 const path=params?.next==='login'?'/login':'/';
 redirect('https://trading.devinx.com.br'+path);
}
