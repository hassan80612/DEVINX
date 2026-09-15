'use client';

import {createBrowserClient} from '@supabase/ssr';

type BrowserClient=ReturnType<typeof createBrowserClient>;
let browserClient:BrowserClient|undefined;

export function createClient(){
  if(browserClient)return browserClient;
  browserClient=createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return browserClient;
}
