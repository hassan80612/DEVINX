import {proxyStorefrontRequest} from "@/lib/storefront-backend";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const body=await request.text();
  return proxyStorefrontRequest(`/api/loja/${encodeURIComponent(slug)}/shipping-quote`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body
  });
}
