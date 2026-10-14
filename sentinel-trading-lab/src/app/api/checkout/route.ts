import {NextRequest,NextResponse} from 'next/server';
import {sentinelCheckoutUrl} from '../../../lib/commercial';

// Server owns the known, verified Kiwify destinations. No untrusted redirects.
export function GET(req:NextRequest){
 const market=req.nextUrl.searchParams.get('market')==='INTL'?'INTL':'BR';
 const checkout=sentinelCheckoutUrl(market);
 if(!checkout)return NextResponse.redirect(new URL('/planos',req.url));
 return NextResponse.redirect(checkout,303);
}
