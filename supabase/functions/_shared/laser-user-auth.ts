import {createClient, type SupabaseClient} from "npm:@supabase/supabase-js@2";

function serverSecret(){
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys){
    try{
      const parsed=JSON.parse(keys) as Record<string,string>;
      if(parsed.default)return parsed.default;
    }catch{}
  }
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy)return legacy;
  throw new Error("server_secret_unavailable");
}

export type LaserUserContext={userId:string;admin:SupabaseClient};

export async function requireLaserUser(req:Request):Promise<LaserUserContext|null>{
  const header=req.headers.get("authorization")||"";
  const match=/^Bearer\s+(.+)$/i.exec(header);
  const token=match?.[1]?.trim();
  if(!token)return null;

  const url=Deno.env.get("SUPABASE_URL");
  if(!url)return null;

  const admin=createClient(url,serverSecret(),{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  const{data,error}=await admin.auth.getUser(token);
  const userId=data.user?.id;
  if(error||!userId)return null;
  return {userId,admin};
}

export async function requireLaserMaster(req:Request):Promise<LaserUserContext|null>{
  const ctx=await requireLaserUser(req);
  if(!ctx)return null;
  const{data,error}=await ctx.admin
    .from("devinx_admin_users")
    .select("user_id")
    .eq("user_id",ctx.userId)
    .maybeSingle();
  if(error||!data)return null;
  return ctx;
}
