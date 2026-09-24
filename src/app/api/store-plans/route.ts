import {fetchPublicStorePlans} from "@/lib/storefront-backend";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(){
  try{
    const data=await fetchPublicStorePlans();
    return Response.json(data,{headers:{"Cache-Control":"public, max-age=0, s-maxage=60, stale-while-revalidate=300"}});
  }catch(error){
    console.error("DEVINX_STORE_PLANS",error);
    return Response.json({error:"store_plans_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
