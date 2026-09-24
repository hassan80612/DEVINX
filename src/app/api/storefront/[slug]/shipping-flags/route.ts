import {proxyStorefrontRequest} from "@/lib/storefront-backend";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  return proxyStorefrontRequest(`/api/loja/${encodeURIComponent(slug)}/shipping-flags`);
}
