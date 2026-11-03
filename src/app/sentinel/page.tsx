import {redirect} from 'next/navigation';
import type {Metadata} from 'next';

// Redirect the DevinX product entry directly to the deployed Sentinel
// production domain. Do not depend on optional environment configuration
// or route through the retired Vercel alias.
export const metadata:Metadata={
 title:'Sentinel Trading Lab | DevinX',
 description:'Acesse o Sentinel Trading Lab no domínio oficial.'
};
export default async function SentinelEntry({
 searchParams
}:{searchParams:Promise<{next?:string}>}){
 const params=await searchParams;
 redirect('https://trading.devinx.com.br'+(params?.next==='login'?'/login':'/'));
}
