import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

const CANONICAL_HOST='devinx.com.br';
const protectedPrefixes=[
  '/painel','/onboarding','/rendas','/gastos','/trabalho','/metas','/mais',
  '/cartoes','/dividas','/recorrentes','/relatorios','/posso-gastar','/preferencias'
];

function copySessionCookies(source:NextResponse,target:NextResponse){
  source.cookies.getAll().forEach(cookie=>target.cookies.set(cookie));
  return target;
}

export async function middleware(request:NextRequest){
  const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(':')[0].toLowerCase();
  const hasAuthCode=request.nextUrl.searchParams.has('code');

  if(host.endsWith('.vercel.app')){
    const canonical=request.nextUrl.clone();
    canonical.protocol='https:';
    canonical.host=CANONICAL_HOST;
    if(hasAuthCode&&canonical.pathname==='/'){
      canonical.pathname='/auth/confirm';
      canonical.searchParams.set('next','auto');
    }
    return NextResponse.redirect(canonical,308);
  }

  if(hasAuthCode&&request.nextUrl.pathname==='/'){
    const callback=request.nextUrl.clone();
    callback.pathname='/auth/confirm';
    callback.searchParams.set('next','auto');
    return NextResponse.redirect(callback,307);
  }

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
  const pathname=request.nextUrl.pathname;
  const isProtected=protectedPrefixes.some(prefix=>pathname===prefix||pathname.startsWith(prefix+'/'));

  if(isProtected&&!claims){
    const url=request.nextUrl.clone();
    url.pathname='/entrar';
    url.searchParams.set('next',pathname);
    return copySessionCookies(response,NextResponse.redirect(url));
  }

  if(pathname==='/entrar'&&claims){
    const url=request.nextUrl.clone();
    url.pathname='/painel';
    url.search='';
    return copySessionCookies(response,NextResponse.redirect(url));
  }

  return response;
}

export const config={
  matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$).*)']
};
