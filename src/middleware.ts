import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';

const protectedPrefixes=[
  '/painel','/onboarding','/rendas','/gastos','/trabalho','/metas','/mais',
  '/cartoes','/dividas','/recorrentes','/relatorios','/posso-gastar','/preferencias'
];

function copySessionCookies(source:NextResponse,target:NextResponse){
  source.cookies.getAll().forEach(cookie=>target.cookies.set(cookie));
  return target;
}

export async function middleware(request:NextRequest){
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
