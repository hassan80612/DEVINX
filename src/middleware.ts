import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

const CANONICAL_HOST='devinx.com.br';
const protectedPrefixes=['/painel','/onboarding','/redefinir-senha'];

function copySessionCookies(source:NextResponse,target:NextResponse){
  source.cookies.getAll().forEach(cookie=>target.cookies.set(cookie));
  return target;
}

export async function middleware(request:NextRequest){
  const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(':')[0].toLowerCase();

  // Keep preview deployments reviewable; production aliases use the canonical domain.
  if(process.env.VERCEL_ENV!=='preview'&&host.endsWith('.vercel.app')){
    const canonical=request.nextUrl.clone();
    canonical.protocol='https:';
    canonical.host=CANONICAL_HOST;
    return NextResponse.redirect(canonical,308);
  }

  const pathname=request.nextUrl.pathname;
  const isProtected=protectedPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'));

  // Public pages do not need an Auth round-trip. This keeps marketing/storefront
  // requests independent from Supabase availability and removes middleware latency.
  if(!isProtected)return NextResponse.next({request});

  let response=NextResponse.next({request});
  const supabase=createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies:{
        getAll(){return request.cookies.getAll()},
        setAll(cookiesToSet){
          cookiesToSet.forEach(({name,value})=>request.cookies.set(name,value));
          response=NextResponse.next({request});
          cookiesToSet.forEach(({name,value,options})=>response.cookies.set(name,value,options));
        }
      }
    }
  );

  const{data,error}=await supabase.auth.getClaims();
  const claims=error?null:data?.claims;
  if(!claims){
    const url=request.nextUrl.clone();
    url.pathname='/entrar';
    url.search='';
    url.searchParams.set('next',pathname);
    return copySessionCookies(response,NextResponse.redirect(url));
  }

  // The onboarding screen is client-only, so it needs one access check here.
  // /painel performs its access check once in its server page instead.
  if(pathname==='/onboarding'||pathname.startsWith('/onboarding/')){
    const{data:accessData,error:accessError}=await supabase.rpc('get_devinx_access_status');
    const access=Array.isArray(accessData)?accessData[0]:accessData;
    if(accessError||!access?.allowed){
      const url=request.nextUrl.clone();
      url.pathname='/entrar';
      url.search='';
      url.searchParams.set('acesso','expirado');
      return copySessionCookies(response,NextResponse.redirect(url));
    }
  }

  return response;
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|woff2?|ttf|otf|mp4|webm|pdf|zip|txt|xml|json)$).*)']};
