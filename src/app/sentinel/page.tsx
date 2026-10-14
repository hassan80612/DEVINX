import {redirect} from 'next/navigation';
import type {Metadata} from 'next';

// Entry point on devinx.com.br: product stays independently deployed.
// Switch SENTINEL_PUBLIC_URL to https://sentinel.devinx.com.br after DNS
// at Registro.br is configured and the custom domain reports READY.
export const metadata:Metadata={
  title:'Sentinel Trading Lab | DevinX',
  description:'Análise técnica de mercado com cenários CALL/PUT. Produto independente.'
};
export default async function SentinelEntry({
 searchParams
}:{searchParams:Promise<{next?:string}>}){
 const params=await searchParams;
 const configured=String(process.env.SENTINEL_PUBLIC_URL||'').trim();
 const origin=/^https:\/\/sentinel\.devinx\.com\.br\/?$/.test(configured)?
   'https://sentinel.devinx.com.br':'https://sentinel-trading-lab.vercel.app';
 redirect(origin+(params?.next==='login'?'/login':'/'));
}
